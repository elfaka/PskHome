/**
 * 모의투자 시뮬레이터 — 세션 상태와 요청/응답 DTO.
 *
 * 금액은 모두 원(KRW) 단위 number 다. 국내 주식 가격은 정수라 부동소수 오차가 문제 되지 않는다.
 * 평균단가는 나눗셈이라 소수가 생기므로, 상태에는 매입원가 합계(costBasis)를 두고 평균은 보여줄 때만 계산한다.
 */

export const INITIAL_CASH = 10_000_000;
/** 세션이 끝없이 커지지 않도록 최근 거래만 남긴다. */
export const MAX_TRADES = 200;

export type OrderSide = "BUY" | "SELL";

export interface HoldingState {
  symbol: string;
  name: string;
  quantity: number;
  /** 남은 보유분의 매입원가 합계 */
  costBasis: number;
}

export interface TradeRecord {
  id: string;
  symbol: string;
  name: string;
  side: OrderSide;
  quantity: number;
  /** 체결가 (토스 현재가) */
  price: number;
  /** 체결금액 = price × quantity */
  amount: number;
  /** 매도일 때만 값이 있다 */
  realizedPnl: number | null;
  executedAt: string;
}

/** express-session 에 저장되는 포트폴리오 */
export interface PortfolioState {
  initialCash: number;
  cash: number;
  realizedPnl: number;
  holdings: Record<string, HoldingState>;
  /** 최신순 */
  trades: TradeRecord[];
  createdAt: string;
}

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  quantity: number;
}

export interface HoldingView {
  symbol: string;
  name: string;
  quantity: number;
  avgPrice: number;
  costBasis: number;
  /** 시세를 못 받아오면 null — 이때 평가금액은 매입원가로 대신한다 */
  currentPrice: number | null;
  marketValue: number;
  unrealizedPnl: number | null;
  /** 수익률 (0.05 = 5%) */
  returnRate: number | null;
}

export interface PortfolioView {
  initialCash: number;
  cash: number;
  holdings: HoldingView[];
  totalMarketValue: number;
  totalAssets: number;
  /** 총자산 - 초기 예수금 */
  totalPnl: number;
  totalReturnRate: number;
  realizedPnl: number;
  trades: TradeRecord[];
  createdAt: string;
}

export interface OrderResult {
  trade: TradeRecord;
  portfolio: PortfolioView;
}

export interface Quote {
  symbol: string;
  price: number;
  currency: "KRW" | "USD";
  /** 체결 시각. 체결이 없으면 null */
  timestamp: string | null;
}

/** 관심종목 목록용 — 현재가 + 전일 대비 */
export interface QuoteWithChange extends Quote {
  prevClose: number | null;
  change: number | null;
  changeRate: number | null;
}

export interface StockSearchItem {
  symbol: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  securityType: string;
}

export interface CandlePoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ---------------------------------------------------------------------------
// 시세 화면 (차트·호가·체결·수급·종목 개요)
// ---------------------------------------------------------------------------

/** 차트 봉 단위. 분봉은 토스 1분봉을, 주·월봉은 일봉을 묶어 만든다. */
export type Timeframe = "1m" | "5m" | "15m" | "1d" | "1w" | "1M";

export interface ChartIndicators {
  ma5: (number | null)[];
  ma20: (number | null)[];
  ma60: (number | null)[];
  ma120: (number | null)[];
  bollinger: { middle: number | null; upper: number | null; lower: number | null }[];
  rsi: (number | null)[];
  macd: { macd: number | null; signal: number | null; histogram: number | null }[];
}

export interface ChartData {
  symbol: string;
  timeframe: Timeframe;
  /** 오래된 것부터 */
  candles: CandlePoint[];
  /** candles 와 같은 길이·순서 */
  indicators: ChartIndicators;
}

export interface OrderbookLevel {
  price: number;
  volume: number;
}

export interface Orderbook {
  timestamp: string | null;
  /** 매도호가 — 높은 가격이 위로 오도록 높은 가격순 */
  asks: OrderbookLevel[];
  /** 매수호가 — 높은 가격순 */
  bids: OrderbookLevel[];
  totalAskVolume: number;
  totalBidVolume: number;
}

export interface TradeTick {
  price: number;
  volume: number;
  time: string;
}

export interface InvestorFlowDay {
  date: string;
  /** 순매수 거래량(주). 당일 잠정치에서는 개인·기타법인이 null */
  individual: number | null;
  foreigner: number;
  institution: number;
  otherCorporation: number | null;
  /** 외국인 보유율 (0.5 = 50%) */
  foreignerHoldingRate: number | null;
  /** 공매도 거래량 비중 (0.05 = 5%) */
  shortSellingRate: number | null;
}

/** DART 사업보고서 기반 재무 지표 */
export interface Valuation {
  /** 예: "2025 사업보고서 (연결)" */
  basis: string;
  bsnsYear: number;
  consolidated: boolean;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  totalEquity: number | null;
  totalLiabilities: number | null;
  eps: number | null;
  bps: number | null;
  /** EPS 가 0 이하(적자)면 null */
  per: number | null;
  pbr: number | null;
  /** 0.12 = 12% */
  roe: number | null;
  operatingMargin: number | null;
  debtRatio: number | null;
  dividendPerShare: number | null;
  dividendYield: number | null;
}

export interface StockOverview {
  symbol: string;
  name: string;
  market: string;
  securityType: string;
  currency: "KRW" | "USD";
  tradingSuspended: boolean;
  price: number | null;
  priceTime: string | null;
  prevClose: number | null;
  change: number | null;
  changeRate: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  high52w: number | null;
  low52w: number | null;
  upperLimit: number | null;
  lowerLimit: number | null;
  sharesOutstanding: number | null;
  marketCap: number | null;
  valuation: Valuation | null;
  /** valuation 이 null 인 이유 (키 미설정, ETF 등) */
  valuationNote: string | null;
}

// ---------------------------------------------------------------------------
// 매수·매도 추천
// ---------------------------------------------------------------------------

export type Rating = "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";

export type FactorCategory = "trend" | "momentum" | "position" | "flow" | "valuation";

export interface AnalysisFactor {
  key: string;
  category: FactorCategory;
  label: string;
  /** 이 항목의 점수 (+ 매수 / - 매도) */
  score: number;
  /** 이 항목이 낼 수 있는 최대 절댓값 */
  maxScore: number;
  /** unavailable = 데이터가 없어 0점 처리 / info = 참고용(점수 없음) */
  signal: "positive" | "negative" | "neutral" | "unavailable" | "info";
  reason: string;
}

export interface Analysis {
  symbol: string;
  name: string;
  asOf: string;
  price: number;
  /** -100 ~ 100 */
  score: number;
  rating: Rating;
  ratingLabel: string;
  summary: string;
  factors: AnalysisFactor[];
  indicators: {
    ma5: number | null;
    ma20: number | null;
    ma60: number | null;
    ma120: number | null;
    rsi14: number | null;
    macd: number | null;
    macdSignal: number | null;
    bollingerUpper: number | null;
    bollingerLower: number | null;
    high52w: number | null;
    low52w: number | null;
    return1y: number | null;
    maxDrawdown1y: number | null;
  };
  disclaimer: string;
}
