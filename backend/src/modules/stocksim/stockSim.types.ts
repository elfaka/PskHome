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
