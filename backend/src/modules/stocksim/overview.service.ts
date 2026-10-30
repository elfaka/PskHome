import { kstDate } from "./indicators.js";
import * as marketData from "./marketData.service.js";
import type { CandlePoint, Quote, StockOverview } from "./stockSim.types.js";
import { getValuation } from "./valuation.js";

/**
 * 종목 헤더에 쓰는 개요 — 현재가·당일 시고저·52주 범위·상하한가·시가총액·재무 지표.
 *
 * 여러 데이터를 모으므로 하나가 실패해도 나머지는 보여준다 (해당 칸만 null).
 * 종목 정보 자체를 못 받으면(없는 종목 등) 그때만 실패한다.
 */

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** 실패하면 null 로 바꾼다 — 일부 데이터가 없어도 화면 전체가 깨지지 않게 */
async function optional<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

/**
 * 현재가가 찍힌 날의 일봉과 그 전 거래일 종가.
 * 장 마감 뒤·주말에는 현재가가 마지막 거래일 종가이므로 "오늘"이 아니라 현재가 날짜를 기준으로 잡는다.
 */
export function sessionBars(candles: CandlePoint[], quote: Quote | null): { today: CandlePoint | null; prevClose: number | null } {
  if (candles.length === 0) return { today: null, prevClose: null };

  const quoteDate = kstDate(quote?.timestamp ?? new Date().toISOString());
  const lastBar = candles[candles.length - 1];

  if (kstDate(lastBar.time) === quoteDate) {
    return { today: lastBar, prevClose: candles.length > 1 ? candles[candles.length - 2].close : null };
  }

  // 현재가 날짜의 일봉이 아직 없으면(장 시작 직후 등) 마지막 봉이 전일이다.
  return { today: null, prevClose: lastBar.close };
}

export function range52w(candles: CandlePoint[], now = Date.now()): { high: number | null; low: number | null } {
  const recent = candles.filter((c) => now - new Date(c.time).getTime() <= YEAR_MS);
  if (recent.length === 0) return { high: null, low: null };

  return {
    high: Math.max(...recent.map((c) => c.high)),
    low: Math.min(...recent.map((c) => c.low)),
  };
}

export async function getOverview(symbol: string): Promise<StockOverview> {
  const stock = await marketData.getStock(symbol);

  const [quote, candles, limits] = await Promise.all([
    optional(marketData.getQuote(stock.symbol)),
    optional(marketData.getDailyCandles(stock.symbol)),
    optional(marketData.getPriceLimits(stock.symbol)),
  ]);

  const price = quote?.price ?? null;
  const { today, prevClose } = sessionBars(candles ?? [], quote);
  const { high: high52w, low: low52w } = range52w(candles ?? []);
  const shares = Number(stock.sharesOutstanding);
  const sharesOutstanding = Number.isFinite(shares) && shares > 0 ? shares : null;
  const { valuation, note } = await getValuation(stock, price);
  const change = price != null && prevClose != null ? price - prevClose : null;

  return {
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market,
    securityType: stock.securityType,
    currency: stock.currency,
    tradingSuspended: stock.koreanMarketDetail?.krxTradingSuspended ?? false,
    price,
    priceTime: quote?.timestamp ?? null,
    prevClose,
    change,
    changeRate: change != null && prevClose ? change / prevClose : null,
    open: today?.open ?? null,
    // 일봉은 캐시(5분)라 현재가가 그 사이 고가·저가를 넘었을 수 있다.
    high: today ? Math.max(today.high, price ?? -Infinity) : null,
    low: today ? Math.min(today.low, price ?? Infinity) : null,
    volume: today?.volume ?? null,
    high52w: high52w != null && price != null ? Math.max(high52w, price) : high52w,
    low52w: low52w != null && price != null ? Math.min(low52w, price) : low52w,
    upperLimit: limits?.upperLimitPrice != null ? Number(limits.upperLimitPrice) : null,
    lowerLimit: limits?.lowerLimitPrice != null ? Number(limits.lowerLimitPrice) : null,
    sharesOutstanding,
    marketCap: price != null && sharesOutstanding != null ? price * sharesOutstanding : null,
    valuation,
    valuationNote: note,
  };
}
