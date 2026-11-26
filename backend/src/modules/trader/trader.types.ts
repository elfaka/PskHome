/**
 * 자동매매 대시보드 응답 타입. 금액·수량·비율은 Decimal 문자열이다 (float 금지).
 * 시각은 ISO-8601 UTC("...Z"). 화면이 KST 로 바꿔 보여준다.
 */

export type Dec = string;

export interface TraderPosition {
  symbol: string;
  qty: Dec;
  avgPrice: Dec;
  lastPrice: Dec | null;
  lastPriceAt: string | null;
  marketValue: Dec | null;
  unrealizedPnl: Dec | null;
  realizedPnl: Dec;
}

export interface TraderSummary {
  account: { name: string; broker: string; createdAt: string | null } | null;
  cash: Dec | null;
  marketValue: Dec | null;
  equity: Dec | null;
  dayStartEquity: Dec | null;
  dayPnl: Dec | null;
  positions: TraderPosition[];
  openOrders: number;
  killswitch: { halted: boolean; reason: string | null; updatedAt: string | null };
  // 엔진이 살아 있는지 가늠하는 마지막 기록 시각
  lastQuoteAt: string | null;
  lastDecisionAt: string | null;
}

export interface TraderOrder {
  clientOrderId: string;
  symbol: string;
  side: string;
  orderType: string;
  qty: Dec;
  limitPrice: Dec | null;
  status: string;
  filledQty: Dec;
  avgFillPrice: Dec | null;
  strategyId: string | null;
  rejectReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TraderFill {
  execId: string;
  clientOrderId: string;
  symbol: string;
  side: string;
  qty: Dec;
  price: Dec;
  commission: Dec;
  tax: Dec;
  slippage: Dec;
  ts: string | null;
}

export interface TraderDecision {
  id: number;
  ts: string | null;
  barTs: string | null;
  strategyId: string;
  symbol: string;
  action: string;
  reason: string;
  shadow: boolean;
  score: Dec | null;
  confidence: Dec | null;
  riskResult: string | null;
  riskReason: string | null;
  clientOrderId: string | null;
  entryPrice: Dec | null;
  stopLoss: Dec | null;
  takeProfit: Dec | null;
  riskReward: Dec | null;
  reasons: string[] | null;
  /** 가격·맥락·이슈 점수 공급부 (출처·모델 버전·점수) */
  components: Record<string, unknown> | null;
}

export interface TraderPerformanceRow {
  strategyId: string;
  action: string;
  horizon: string;
  count: number;
  avgReturnPct: Dec | null;
  winRate: Dec | null;
  avgMfePct: Dec | null;
  avgMaePct: Dec | null;
  pending: number;
}

export interface TraderRiskEvent {
  id: number;
  ts: string | null;
  kind: string;
  symbol: string | null;
  clientOrderId: string | null;
  detail: unknown;
}
