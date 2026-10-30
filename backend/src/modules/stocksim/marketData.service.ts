import { HttpError } from "../../lib/httpError.js";
import { TtlCache } from "../../lib/ttlCache.js";
import { aggregateCandles, bollinger, macd, rsi, sma } from "./indicators.js";
import type { TossPriceLimits, TossStock } from "./toss/toss.types.js";
import { getTossClient } from "./toss/tossClient.js";
import type {
  CandlePoint,
  ChartData,
  InvestorFlowDay,
  Orderbook,
  Quote,
  StockSearchItem,
  Timeframe,
  TradeTick,
} from "./stockSim.types.js";

/**
 * 토스 시세를 화면/시뮬레이터가 쓰는 형태로 바꾸고, 토스 rate limit 을 지키도록 캐시한다.
 *
 * | 데이터 | 토스 한도(초당) | 캐시 |
 * |---|---|---|
 * | 현재가·호가·체결·상하한가 | 15회 (MARKET_DATA 그룹 공유) | 현재가 3초, 호가·체결 2초, 상하한가 1분 |
 * | 1분봉 / 일봉 | 20회 | 1분봉 20초, 일봉 5분 — 1회에 200개라 여러 번 이어 받는다 |
 * | 종목 정보 | 5회 | 하루 — 이름·시장·통화는 거의 바뀌지 않는다 |
 * | 전체 종목(검색용) | 1회 | 하루 — 토스도 하루 1회 조회 후 캐싱을 권장한다 |
 * | 투자자별 매매동향·공매도 | 10회 | 10분 — 일별 데이터다 |
 */

const QUOTE_TTL_MS = 3_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** `/stocks/all` 은 초당 1회라 KOSPI·KOSDAQ 를 연달아 부르면 429 가 난다. */
const STOCK_ALL_INTERVAL_MS = 1_100;
/** `/prices`·`/stocks` 다건 조회 상한 */
const MAX_SYMBOLS = 200;
const SEARCH_LIMIT = 20;
/** 토스 캔들 한 번 조회 상한 */
const CANDLE_PAGE = 200;
const ORDERBOOK_DEPTH = 10;
const FLOW_DAYS = 20;

/** 분봉 화면용 1분봉 개수 — 정규장+NXT 로 하루 반 남짓 (5페이지) */
export const MINUTE_CANDLES = 1000;
/** 일·주·월봉 화면과 분석용 일봉 개수 — 약 3년 (4페이지) */
export const DAILY_CANDLES = 750;

const SYMBOL_PATTERN = /^[A-Za-z0-9.-]{1,20}$/;

interface Cached<T> {
  value: T;
  fetchedAt: number;
}

const quoteCache = new Map<string, Cached<Quote>>();
const stockCache = new TtlCache<TossStock>(DAY_MS);
const minuteCandleCache = new TtlCache<CandlePoint[]>(20_000);
const dailyCandleCache = new TtlCache<CandlePoint[]>(5 * 60_000);
const orderbookCache = new TtlCache<Orderbook>(2_000);
const tradesCache = new TtlCache<TradeTick[]>(2_000);
const priceLimitCache = new TtlCache<TossPriceLimits>(60_000);
const flowCache = new TtlCache<InvestorFlowDay[]>(10 * 60_000);
let universe: Cached<StockSearchItem[]> | null = null;
let universeLoading: Promise<StockSearchItem[]> | null = null;

function fresh<T>(entry: Cached<T> | null | undefined, ttl: number): entry is Cached<T> {
  return entry != null && Date.now() - entry.fetchedAt < ttl;
}

/** 테스트에서 캐시가 테스트 사이에 새지 않도록 비운다. */
export function resetMarketDataCache(): void {
  quoteCache.clear();
  stockCache.clear();
  minuteCandleCache.clear();
  dailyCandleCache.clear();
  orderbookCache.clear();
  tradesCache.clear();
  priceLimitCache.clear();
  flowCache.clear();
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

function normalizeSymbol(raw: string): string {
  return normalizeSymbols([raw])[0];
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
  const symbol = normalizeSymbol(rawSymbol);

  return stockCache.get(symbol, async () => {
    const [stock] = await getTossClient().getStocks([symbol]);
    if (!stock) {
      throw HttpError.notFound(`종목을 찾을 수 없습니다: ${symbol}`, "STOCK_NOT_FOUND");
    }
    return stock;
  });
}

/**
 * 봉을 `count` 개까지 이어 받아 **오래된 것부터** 돌려준다.
 * 토스는 한 번에 200개, 최신순이며 다음 페이지 기준 시각(`nextBefore`)을 준다.
 */
async function fetchCandles(symbol: string, interval: "1m" | "1d", count: number): Promise<CandlePoint[]> {
  const client = getTossClient();
  const byTime = new Map<string, CandlePoint>();
  let before: string | undefined;

  while (byTime.size < count) {
    const page = await client.getCandles(symbol, interval, Math.min(CANDLE_PAGE, count - byTime.size), before);

    for (const c of page.candles) {
      byTime.set(c.timestamp, {
        time: c.timestamp,
        open: Number(c.openPrice),
        high: Number(c.highPrice),
        low: Number(c.lowPrice),
        close: Number(c.closePrice),
        volume: Number(c.volume),
      });
    }

    if (!page.nextBefore || page.candles.length === 0) break;
    before = page.nextBefore;
  }

  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
}

/** 일봉 (오래된 것부터, 약 3년). 분석·52주 고저·일/주/월봉 차트가 같이 쓴다. */
export async function getDailyCandles(rawSymbol: string): Promise<CandlePoint[]> {
  const symbol = normalizeSymbol(rawSymbol);
  return dailyCandleCache.get(symbol, () => fetchCandles(symbol, "1d", DAILY_CANDLES));
}

async function getMinuteCandles(symbol: string): Promise<CandlePoint[]> {
  return minuteCandleCache.get(symbol, () => fetchCandles(symbol, "1m", MINUTE_CANDLES));
}

export function buildChartIndicators(candles: CandlePoint[]): ChartData["indicators"] {
  const closes = candles.map((c) => c.close);

  return {
    ma5: sma(closes, 5),
    ma20: sma(closes, 20),
    ma60: sma(closes, 60),
    ma120: sma(closes, 120),
    bollinger: bollinger(closes, 20, 2),
    rsi: rsi(closes, 14),
    macd: macd(closes),
  };
}

/** 차트 데이터 — 봉 + 같은 길이의 지표 배열 */
export async function getChart(rawSymbol: string, timeframe: Timeframe): Promise<ChartData> {
  const symbol = normalizeSymbol(rawSymbol);

  let candles: CandlePoint[];
  switch (timeframe) {
    case "1m":
      candles = await getMinuteCandles(symbol);
      break;
    case "5m":
    case "15m":
      candles = aggregateCandles(await getMinuteCandles(symbol), timeframe);
      break;
    case "1d":
      candles = await getDailyCandles(symbol);
      break;
    case "1w":
    case "1M":
      candles = aggregateCandles(await getDailyCandles(symbol), timeframe);
      break;
  }

  return { symbol, timeframe, candles, indicators: buildChartIndicators(candles) };
}

export async function getOrderbook(rawSymbol: string): Promise<Orderbook> {
  const symbol = normalizeSymbol(rawSymbol);

  return orderbookCache.get(symbol, async () => {
    const book = await getTossClient().getOrderbook(symbol);
    const level = (l: { price: string; volume: string }) => ({ price: Number(l.price), volume: Number(l.volume) });

    // 토스는 매도호가를 낮은 가격순으로 준다. 화면은 위가 높은 가격이므로 뒤집는다.
    const asks = book.asks.slice(0, ORDERBOOK_DEPTH).map(level).reverse();
    const bids = book.bids.slice(0, ORDERBOOK_DEPTH).map(level);

    return {
      timestamp: book.timestamp,
      asks,
      bids,
      totalAskVolume: asks.reduce((s, l) => s + l.volume, 0),
      totalBidVolume: bids.reduce((s, l) => s + l.volume, 0),
    };
  });
}

/** 당일 최근 체결 (최신순, 최대 50건) */
export async function getTrades(rawSymbol: string): Promise<TradeTick[]> {
  const symbol = normalizeSymbol(rawSymbol);

  return tradesCache.get(symbol, async () =>
    (await getTossClient().getTrades(symbol, 50)).map((t) => ({
      price: Number(t.price),
      volume: Number(t.volume),
      time: t.timestamp,
    }))
  );
}

export async function getPriceLimits(rawSymbol: string): Promise<TossPriceLimits> {
  const symbol = normalizeSymbol(rawSymbol);
  return priceLimitCache.get(symbol, () => getTossClient().getPriceLimits(symbol));
}

/**
 * 최근 20거래일 투자자별 순매수와 공매도 비중 (최신순). 국내 종목만.
 * 공매도 조회가 실패해도 매매동향은 보여준다.
 */
export async function getInvestorFlows(rawSymbol: string): Promise<InvestorFlowDay[]> {
  const symbol = normalizeSymbol(rawSymbol);

  return flowCache.get(symbol, async () => {
    const client = getTossClient();
    const [trading, shorts] = await Promise.all([
      client.getInvestorTrading(symbol, FLOW_DAYS),
      client.getShortSelling(symbol, FLOW_DAYS).catch(() => null),
    ]);

    const shortByDate = new Map(
      (shorts?.records ?? []).map((r) => [
        r.date,
        r.shortSellingVolumeRate == null ? null : Number(r.shortSellingVolumeRate),
      ])
    );
    const net = (v: { netBuyVolume: string } | null) => (v == null ? null : Number(v.netBuyVolume));

    return trading.records.map((r) => ({
      date: r.date,
      individual: net(r.individual),
      foreigner: Number(r.foreigner.netBuyVolume),
      institution: Number(r.institution.netBuyVolume),
      otherCorporation: net(r.otherCorporation),
      foreignerHoldingRate: r.foreignerHolding ? Number(r.foreignerHolding.holdingRate) : null,
      shortSellingRate: shortByDate.get(r.date) ?? null,
    }));
  });
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
