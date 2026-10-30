import type { TossClient } from "../modules/stocksim/toss/tossClient.js";
import type { TossStock } from "../modules/stocksim/toss/toss.types.js";

/**
 * 테스트용 토스 클라이언트 — 실제 API 대신 메모리의 시세를 돌려준다.
 * `prices` 를 바꾸면 다음 조회부터 그 가격이 나온다 (marketData 캐시는 테스트마다 비운다).
 */
export interface FakeTossClient extends TossClient {
  prices: Map<string, number>;
  stocks: Map<string, TossStock>;
  calls: { method: keyof TossClient; args: unknown[] }[];
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
    koreanMarketDetail: {
      liquidationTrading: false,
      nxtSupported: true,
      krxTradingSuspended: false,
      nxtTradingSuspended: false,
    },
    ...overrides,
  };
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

  return {
    prices,
    stocks,
    calls,
    async getPrices(symbols) {
      calls.push({ method: "getPrices", args: [symbols] });
      return symbols
        .filter((s) => prices.has(s))
        .map((s) => ({
          symbol: s,
          timestamp: "2026-10-30T10:00:00+09:00",
          lastPrice: String(prices.get(s)),
          currency: stocks.get(s)?.currency ?? "KRW",
        }));
    },
    async getStocks(symbols) {
      calls.push({ method: "getStocks", args: [symbols] });
      return symbols.flatMap((s) => (stocks.has(s) ? [stocks.get(s)!] : []));
    },
    async getCandles(symbol, interval, count) {
      calls.push({ method: "getCandles", args: [symbol, interval, count] });
      // 토스처럼 최신순으로 돌려준다.
      return {
        candles: Array.from({ length: count }, (_, i) => ({
          timestamp: new Date(Date.UTC(2026, 9, 30 - i)).toISOString(),
          openPrice: "100",
          highPrice: "110",
          lowPrice: "90",
          closePrice: String(100 + count - i),
          volume: "1000",
          currency: "KRW" as const,
        })),
        nextBefore: null,
      };
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
  };
}
