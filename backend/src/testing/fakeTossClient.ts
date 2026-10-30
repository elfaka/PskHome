import type { TossClient } from "../modules/stocksim/toss/tossClient.js";
import type { TossCandle, TossStock } from "../modules/stocksim/toss/toss.types.js";

/**
 * 테스트용 토스 클라이언트 — 실제 API 대신 메모리의 시세를 돌려준다.
 * `prices` 를 바꾸면 다음 조회부터 그 가격이 나온다 (marketData 캐시는 테스트마다 비운다).
 *
 * 캔들은 토스처럼 최신순으로 한 번에 최대 200개씩, `nextBefore` 로 이어 받게 돌려준다.
 * 일봉은 `dailyCount` 개(평일만, 마지막 봉이 2026-10-30 금요일), 1분봉은 `minuteCount` 개다.
 */
export interface FakeTossClient extends TossClient {
  prices: Map<string, number>;
  stocks: Map<string, TossStock>;
  calls: { method: keyof TossClient; args: unknown[] }[];
  dailyCount: number;
  minuteCount: number;
}

export function krStock(symbol: string, name: string, overrides: Partial<TossStock> = {}): TossStock {
  return {
    symbol,
    name,
    englishName: name,
    market: "KOSPI",
    securityType: "STOCK",
    status: "ACTIVE",
    currency: "KRW",
    sharesOutstanding: "1000000",
    koreanMarketDetail: {
      liquidationTrading: false,
      nxtSupported: true,
      krxTradingSuspended: false,
      nxtTradingSuspended: false,
    },
    ...overrides,
  };
}

/** 평일만 거슬러 올라가며 일봉 시각(KST 자정)을 만든다. 최신순. */
function dailyTimes(count: number): string[] {
  const times: string[] = [];
  const d = new Date(Date.UTC(2026, 9, 29, 15)); // 2026-10-30 00:00 KST
  while (times.length < count) {
    const dow = new Date(d.getTime() + 9 * 3_600_000).getUTCDay();
    if (dow !== 0 && dow !== 6) times.push(d.toISOString());
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return times;
}

/** 1분봉 시각. 2026-10-30 15:30 KST 부터 거슬러 올라간다. 최신순. */
function minuteTimes(count: number): string[] {
  const end = Date.UTC(2026, 9, 30, 6, 30); // 15:30 KST
  return Array.from({ length: count }, (_, i) => new Date(end - i * 60_000).toISOString());
}

export function createFakeTossClient(): FakeTossClient {
  const prices = new Map<string, number>([
    ["005930", 70_000],
    ["000660", 200_000],
    ["AAPL", 230],
  ]);
  const stocks = new Map<string, TossStock>([
    ["005930", krStock("005930", "삼성전자")],
    ["000660", krStock("000660", "SK하이닉스")],
    ["AAPL", krStock("AAPL", "애플", { market: "NASDAQ", currency: "USD", koreanMarketDetail: null })],
  ]);
  const calls: FakeTossClient["calls"] = [];

  const fake: FakeTossClient = {
    prices,
    stocks,
    calls,
    dailyCount: 300,
    minuteCount: 300,
    async getPrices(symbols) {
      calls.push({ method: "getPrices", args: [symbols] });
      return symbols
        .filter((s) => prices.has(s))
        .map((s) => ({
          symbol: s,
          timestamp: "2026-10-30T06:30:00.000Z",
          lastPrice: String(prices.get(s)),
          currency: stocks.get(s)?.currency ?? "KRW",
        }));
    },
    async getStocks(symbols) {
      calls.push({ method: "getStocks", args: [symbols] });
      return symbols.flatMap((s) => (stocks.has(s) ? [stocks.get(s)!] : []));
    },
    async getCandles(symbol, interval, count, before) {
      calls.push({ method: "getCandles", args: [symbol, interval, count, before] });
      const times = interval === "1d" ? dailyTimes(fake.dailyCount) : minuteTimes(fake.minuteCount);
      const start = before ? times.findIndex((t) => t <= before) : 0;
      const page = start < 0 ? [] : times.slice(start, start + count);

      // 종가는 오래될수록 1씩 낮다 (최신 봉 = 100 + 개수).
      const candles: TossCandle[] = page.map((timestamp, i) => {
        const close = 100 + times.length - (start + i);
        return {
          timestamp,
          openPrice: String(close - 1),
          highPrice: String(close + 2),
          lowPrice: String(close - 2),
          closePrice: String(close),
          volume: "1000",
          currency: "KRW",
        };
      });
      const next = start + count;
      return { candles, nextBefore: start >= 0 && next < times.length ? times[next] : null };
    },
    async getAllStocks(market) {
      calls.push({ method: "getAllStocks", args: [market] });
      const all = market === "KOSPI"
        ? [
            { symbol: "005930", name: "삼성전자", securityType: "STOCK", isCommonShare: true, isinCode: "KR7005930003" },
            { symbol: "005935", name: "삼성전자우", securityType: "STOCK", isCommonShare: false, isinCode: "KR7005931001" },
            { symbol: "000660", name: "SK하이닉스", securityType: "STOCK", isCommonShare: true, isinCode: "KR7000660001" },
          ]
        : [{ symbol: "035720", name: "카카오게임즈", securityType: "STOCK", isCommonShare: true, isinCode: "KR7293490004" }];
      return all;
    },
    async getOrderbook(symbol) {
      calls.push({ method: "getOrderbook", args: [symbol] });
      const p = prices.get(symbol) ?? 1000;
      return {
        timestamp: "2026-10-30T06:30:00.000Z",
        currency: "KRW",
        // 토스처럼 매도호가는 낮은 가격순, 매수호가는 높은 가격순
        asks: Array.from({ length: 12 }, (_, i) => ({ price: String(p + (i + 1) * 100), volume: String(10 + i) })),
        bids: Array.from({ length: 12 }, (_, i) => ({ price: String(p - i * 100), volume: String(20 + i) })),
      };
    },
    async getTrades(symbol, count) {
      calls.push({ method: "getTrades", args: [symbol, count] });
      const p = prices.get(symbol) ?? 1000;
      return Array.from({ length: Math.min(count, 3) }, (_, i) => ({
        price: String(p - i * 100),
        volume: String(i + 1),
        timestamp: new Date(Date.UTC(2026, 9, 30, 6, 30 - i)).toISOString(),
        currency: "KRW" as const,
      }));
    },
    async getPriceLimits(symbol) {
      calls.push({ method: "getPriceLimits", args: [symbol] });
      const p = prices.get(symbol) ?? 1000;
      return {
        timestamp: "2026-10-30T06:30:00.000Z",
        upperLimitPrice: String(Math.round(p * 1.3)),
        lowerLimitPrice: String(Math.round(p * 0.7)),
        currency: "KRW",
      };
    },
    async getInvestorTrading(symbol, count) {
      calls.push({ method: "getInvestorTrading", args: [symbol, count] });
      const vol = (net: number) => ({ buyVolume: "0", sellVolume: "0", netBuyVolume: String(net) });
      return {
        records: dailyTimes(count).map((t) => ({
          date: t.slice(0, 10),
          individual: vol(-300),
          foreigner: vol(200),
          institution: vol(100),
          otherCorporation: null,
          foreignerHolding: { holdingQuantity: "500000", limitQuantity: "1000000", holdingRate: "0.5" },
        })),
        nextUntil: null,
      };
    },
    async getShortSelling(symbol, count) {
      calls.push({ method: "getShortSelling", args: [symbol, count] });
      return {
        records: dailyTimes(count).map((t) => ({
          date: t.slice(0, 10),
          shortSellingVolume: "10",
          shortSellingAmount: "1000",
          shortSellingVolumeRate: "0.01",
          shortSellingAmountRate: "0.01",
        })),
        nextUntil: null,
      };
    },
  };

  return fake;
}
