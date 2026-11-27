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
  /** 총자산 대비 비중 (0~1 비율 문자열) */
  weight: Dec | null;
  /** 종목 보유 한도 대비 사용률 (비율) */
  limitUsage: Dec | null;
}

export interface TraderSummary {
  account: { name: string; broker: string; createdAt: string | null } | null;
  cash: Dec | null;
  marketValue: Dec | null;
  equity: Dec | null;
  dayStartEquity: Dec | null;
  dayPnl: Dec | null;
  /** 시작 현금 (입금 합계) */
  initialCash: Dec | null;
  /** 누적 수익률 (비율) = (총자산 - 시작 현금) / 시작 현금 */
  cumReturn: Dec | null;
  /** 하루 손실 한도 (엔진 적용값) */
  dailyLossLimit: Dec | null;
  /** 하루 손실 한도 사용률 (비율, 손실이 없으면 0) */
  lossUsage: Dec | null;
  /** 종목 보유 한도 (엔진 적용값) */
  maxPositionValue: Dec | null;
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

// ── 상태·전략·활동 (상단 상태 바, 전략 목록, 활동 로그) ────────────────────────

export type EngineRunState = "running" | "stale" | "unknown";

export interface TraderAlert {
  level: "error" | "warn" | "info";
  code: string;
  message: string;
}

export interface TraderSettingsState {
  base: Record<string, string | null>;
  effective: Record<string, string | null>;
  overrides: Record<string, string>;
  appliedVersion: number;
  /** 화면이 저장했지만 엔진이 아직 적용하지 않은 버전 (없으면 null) */
  pending: { version: number; values: Record<string, string>; at: string | null } | null;
  rejected: { version: number; reason: string; at: string | null } | null;
  info: Record<string, unknown> | null;
}

export interface TraderStatus {
  serverTime: string;
  engine: {
    state: EngineRunState;
    heartbeatAt: string | null;
    startedAt: string | null;
    mode: string | null;
    feed: string | null;
    dbOk: boolean | null;
    dataIssues: Record<string, string>;
  };
  killswitch: { halted: boolean; reason: string | null; updatedAt: string | null; updatedBy: string | null };
  lastQuoteAt: string | null;
  lastQuoteBySymbol: Record<string, string>;
  marketOpen: boolean;
  switches: Record<string, boolean>;
  settings: TraderSettingsState | null;
  alerts: TraderAlert[];
}

export interface TraderEquityPoint {
  date: string;
  equity: Dec;
}

export interface TraderEquity {
  points: TraderEquityPoint[];
  /** 최대 낙폭 (비율, 0 이하). 일별 시작 평가금액 + 현재 총자산 기준 */
  mdd: Dec | null;
}

export interface TraderStrategyTick {
  ts: string | null;
  symbol: string;
  action: string;
  riskResult: string | null;
}

export interface TraderStrategyRow {
  id: string;
  shadow: boolean;
  enabled: boolean;
  today: { decisions: number; signals: number; orders: number; fills: number; rejected: number };
  lastDecisionAt: string | null;
  recent: TraderStrategyTick[];
}

export interface TraderActivity {
  id: string;
  ts: string | null;
  level: "error" | "warn" | "info";
  source: "fill" | "order" | "event";
  kind: string;
  symbol: string | null;
  message: string;
}
