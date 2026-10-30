import { HttpError } from "../../lib/httpError.js";
import type { TossStock } from "./toss/toss.types.js";
import { getTossClient } from "./toss/tossClient.js";
import type { CandlePoint, Quote, StockSearchItem } from "./stockSim.types.js";

/**
 * 토스 시세를 화면/시뮬레이터가 쓰는 형태로 바꾸고, 토스 rate limit 을 지키도록 캐시한다.
 *
 * | 데이터 | 토스 한도 | 캐시 |
 * |---|---|---|
 * | 현재가 | 초당 15회 | 3초 — 여러 사용자가 같은 종목을 봐도 한 번만 부른다 |
 * | 일봉 | 초당 20회 | 1분 |
 * | 종목 정보 | 초당 5회 | 하루 — 이름·시장·통화는 거의 바뀌지 않는다 |
 * | 전체 종목(검색용) | 초당 1회 | 하루 — 토스도 하루 1회 조회 후 캐싱을 권장한다 |
 */

const QUOTE_TTL_MS = 3_000;
const CANDLE_TTL_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** `/stocks/all` 은 초당 1회라 KOSPI·KOSDAQ 를 연달아 부르면 429 가 난다. */
const STOCK_ALL_INTERVAL_MS = 1_100;
/** `/prices`·`/stocks` 다건 조회 상한 */
const MAX_SYMBOLS = 200;
const SEARCH_LIMIT = 20;

const SYMBOL_PATTERN = /^[A-Za-z0-9.-]{1,20}$/;

interface Cached<T> {
  value: T;
  fetchedAt: number;
}

const quoteCache = new Map<string, Cached<Quote>>();
const candleCache = new Map<string, Cached<CandlePoint[]>>();
const stockCache = new Map<string, Cached<TossStock>>();
let universe: Cached<StockSearchItem[]> | null = null;
let universeLoading: Promise<StockSearchItem[]> | null = null;

function fresh<T>(entry: Cached<T> | null | undefined, ttl: number): entry is Cached<T> {
  return entry != null && Date.now() - entry.fetchedAt < ttl;
}

/** 테스트에서 캐시가 테스트 사이에 새지 않도록 비운다. */
export function resetMarketDataCache(): void {
  quoteCache.clear();
  candleCache.clear();
  stockCache.clear();
  universe = null;
  universeLoading = null;
}

export function normalizeSymbols(raw: string[]): string[] {
  const symbols = [...new Set(raw.map((s) => s.trim().toUpperCase()).filter(Boolean))];

  if (symbols.length === 0) {
    throw HttpError.badRequest("종목 코드를 하나 이상 입력하세요.", "INVALID_SYMBOL");
  }
  if (symbols.length > MAX_SYMBOLS) {
    throw HttpError.badRequest(`종목은 한 번에 ${MAX_SYMBOLS}개까지 조회할 수 있습니다.`, "INVALID_SYMBOL");
  }
  for (const symbol of symbols) {
    if (!SYMBOL_PATTERN.test(symbol)) {
      throw HttpError.badRequest(`잘못된 종목 코드입니다: ${symbol}`, "INVALID_SYMBOL");
    }
  }

  return symbols;
}

export async function getQuotes(rawSymbols: string[]): Promise<Quote[]> {
  const symbols = normalizeSymbols(rawSymbols);
  const missing = symbols.filter((s) => !fresh(quoteCache.get(s), QUOTE_TTL_MS));

  if (missing.length > 0) {
    const prices = await getTossClient().getPrices(missing);
    const fetchedAt = Date.now();

    for (const p of prices) {
      quoteCache.set(p.symbol, {
        value: { symbol: p.symbol, price: Number(p.lastPrice), currency: p.currency, timestamp: p.timestamp },
        fetchedAt,
      });
    }
  }

  // 토스가 모르는 심볼은 응답에서 빠진다 → 결과에서도 뺀다.
  return symbols.flatMap((s) => {
    const entry = quoteCache.get(s);
    return entry ? [entry.value] : [];
  });
}

export async function getQuote(symbol: string): Promise<Quote> {
  const [quote] = await getQuotes([symbol]);

  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) {
    throw HttpError.badRequest(`현재가를 확인할 수 없는 종목입니다: ${symbol}`, "PRICE_UNAVAILABLE");
  }

  return quote;
}

export async function getStock(rawSymbol: string): Promise<TossStock> {
  const [symbol] = normalizeSymbols([rawSymbol]);
  const cached = stockCache.get(symbol);
  if (fresh(cached, DAY_MS)) return cached.value;

  const [stock] = await getTossClient().getStocks([symbol]);
  if (!stock) {
    throw HttpError.notFound(`종목을 찾을 수 없습니다: ${symbol}`, "STOCK_NOT_FOUND");
  }

  stockCache.set(symbol, { value: stock, fetchedAt: Date.now() });
  return stock;
}

/** 일봉을 오래된 것부터 정렬해 돌려준다 (차트는 왼쪽이 과거). */
export async function getDailyCandles(rawSymbol: string, count: number): Promise<CandlePoint[]> {
  const [symbol] = normalizeSymbols([rawSymbol]);
  const key = `${symbol}:${count}`;
  const cached = candleCache.get(key);
  if (fresh(cached, CANDLE_TTL_MS)) return cached.value;

  const page = await getTossClient().getCandles(symbol, "1d", count);
  const points = page.candles
    .map((c) => ({
      time: c.timestamp,
      open: Number(c.openPrice),
      high: Number(c.highPrice),
      low: Number(c.lowPrice),
      close: Number(c.closePrice),
      volume: Number(c.volume),
    }))
    .reverse();

  candleCache.set(key, { value: points, fetchedAt: Date.now() });
  return points;
}

async function loadUniverse(): Promise<StockSearchItem[]> {
  const client = getTossClient();
  const items: StockSearchItem[] = [];

  for (const market of ["KOSPI", "KOSDAQ"] as const) {
    if (items.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, STOCK_ALL_INTERVAL_MS));
    }
    const listed = await client.getAllStocks(market);
    items.push(...listed.map((s) => ({ symbol: s.symbol, name: s.name, market, securityType: s.securityType })));
  }

  return items;
}

async function getUniverse(): Promise<StockSearchItem[]> {
  if (fresh(universe, DAY_MS)) return universe.value;

  universeLoading ??= loadUniverse()
    .then((value) => {
      universe = { value, fetchedAt: Date.now() };
      return value;
    })
    .finally(() => {
      universeLoading = null;
    });

  return universeLoading;
}

/**
 * 종목명 또는 종목코드로 국내 종목을 찾는다.
 * 정확히 일치 → 앞부분 일치 → 포함 순으로 보여준다.
 */
export async function searchStocks(rawQuery: string): Promise<StockSearchItem[]> {
  const query = rawQuery.trim().toUpperCase();
  if (!query) return [];

  const rank = (item: StockSearchItem): number => {
    const name = item.name.toUpperCase();
    if (item.symbol === query || name === query) return 0;
    if (item.symbol.startsWith(query) || name.startsWith(query)) return 1;
    if (name.includes(query)) return 2;
    return -1;
  };

  return (await getUniverse())
    .map((item) => ({ item, score: rank(item) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => a.score - b.score || a.item.name.length - b.item.name.length)
    .slice(0, SEARCH_LIMIT)
    .map(({ item }) => item);
}
