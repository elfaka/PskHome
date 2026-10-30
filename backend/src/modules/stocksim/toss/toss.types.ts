/**
 * 토스증권 Open API 응답 타입 — 이 모듈이 쓰는 필드만 옮겼다.
 * 원본: https://openapi.tossinvest.com/openapi-docs/latest/openapi.json
 *
 * 가격·수량은 소수 손실을 막으려고 **문자열(decimal)** 로 내려온다.
 */

export type TossCurrency = "KRW" | "USD";

export type TossMarket =
  | "KOSPI"
  | "KOSDAQ"
  | "NYSE"
  | "NASDAQ"
  | "AMEX"
  | "KR_ETC"
  | "US_ETC";

/** 시세/종목 API 의 성공 응답 envelope */
export interface TossResponse<T> {
  result: T;
}

/** 에러 응답 envelope (토큰 엔드포인트는 OAuth2 표준 형식이라 다르다) */
export interface TossErrorBody {
  error?: { code?: string; message?: string; requestId?: string };
}

export interface TossOAuthErrorBody {
  error?: string;
  error_description?: string;
}

export interface TossTokenResponse {
  access_token: string;
  token_type: "Bearer";
  /** 만료까지 남은 초 */
  expires_in: number;
}

/** GET /api/v1/prices */
export interface TossPrice {
  symbol: string;
  /** 체결이 없으면 null */
  timestamp: string | null;
  lastPrice: string;
  currency: TossCurrency;
}

/** GET /api/v1/candles */
export interface TossCandle {
  timestamp: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  volume: string;
  currency: TossCurrency;
}

export interface TossCandlePage {
  /** 최신순 (첫 요소가 가장 최근 봉) */
  candles: TossCandle[];
  nextBefore: string | null;
}

/** GET /api/v1/stocks */
export interface TossStock {
  symbol: string;
  name: string;
  englishName: string;
  market: TossMarket;
  securityType: string;
  status: "SCHEDULED" | "ACTIVE" | "DELISTED";
  currency: TossCurrency;
  /** 발행주식수 (decimal 문자열) */
  sharesOutstanding: string;
  koreanMarketDetail: {
    liquidationTrading: boolean;
    nxtSupported: boolean;
    krxTradingSuspended: boolean;
    nxtTradingSuspended: boolean | null;
  } | null;
}

/** GET /api/v1/stocks/all */
export interface TossListedStock {
  symbol: string;
  name: string;
  securityType: string;
  isCommonShare: boolean;
  isinCode: string;
}

/** GET /api/v1/orderbook */
export interface TossOrderbook {
  timestamp: string | null;
  currency: TossCurrency;
  /** 매도호가 (낮은 가격순) */
  asks: { price: string; volume: string }[];
  /** 매수호가 (높은 가격순) */
  bids: { price: string; volume: string }[];
}

/** GET /api/v1/trades */
export interface TossTrade {
  price: string;
  volume: string;
  timestamp: string;
  currency: TossCurrency;
}

/** GET /api/v1/price-limits */
export interface TossPriceLimits {
  timestamp: string;
  upperLimitPrice: string | null;
  lowerLimitPrice: string | null;
  currency: TossCurrency;
}

export interface TossInvestorVolume {
  buyVolume: string;
  sellVolume: string;
  netBuyVolume: string;
}

/** GET /api/v1/stocks/{symbol}/investor-trading 의 일별 기록 */
export interface TossInvestorTradingRecord {
  date: string;
  /** 당일 잠정 기록에서는 null */
  individual: TossInvestorVolume | null;
  foreigner: TossInvestorVolume;
  institution: TossInvestorVolume;
  otherCorporation: TossInvestorVolume | null;
  foreignerHolding: { holdingQuantity: string; limitQuantity: string; holdingRate: string } | null;
}

export interface TossInvestorTradingPage {
  /** 최신순 */
  records: TossInvestorTradingRecord[];
  nextUntil: string | null;
}

/** GET /api/v1/stocks/{symbol}/short-selling 의 일별 기록 */
export interface TossShortSellingRecord {
  date: string;
  shortSellingVolume: string;
  shortSellingAmount: string;
  shortSellingVolumeRate: string | null;
  shortSellingAmountRate: string | null;
}

export interface TossShortSellingPage {
  /** 최신순 */
  records: TossShortSellingRecord[];
  nextUntil: string | null;
}
