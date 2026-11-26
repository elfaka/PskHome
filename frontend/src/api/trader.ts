import { api } from "./client";

/** 자동매매(/trader) 본인 전용 로그인. 백엔드 `modules/trader` 와 계약이 묶여 있다. */
export type TraderMe =
  | { authenticated: false }
  | { authenticated: true; username: string };

export async function getTraderMe(): Promise<TraderMe> {
  const res = await api.get<TraderMe>("/api/trader/auth/me");
  return res.data;
}

export async function traderLogin(username: string, password: string): Promise<TraderMe> {
  const res = await api.post<TraderMe>("/api/trader/auth/login", { username, password });
  return res.data;
}

export async function traderLogout(): Promise<void> {
  await api.post("/api/trader/auth/logout");
}

// ── 대시보드 (엔진 DB 읽기 전용) ─────────────────────────────────────────
// 금액·수량·비율은 Decimal 문자열이다. 계산하지 말고 lib/trader/decimal 로 포맷만 한다.

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

export interface ComponentRecord {
  kind?: string;
  status?: string;
  source?: string;
  model_version?: string;
  points?: Dec;
  max?: Dec;
  veto?: boolean;
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
  components: { price?: ComponentRecord; context?: ComponentRecord; issue?: ComponentRecord } | null;
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

export async function getTraderSummary(): Promise<TraderSummary> {
  return (await api.get<TraderSummary>("/api/trader/summary")).data;
}

export async function getTraderOrders(limit = 30): Promise<TraderOrder[]> {
  return (await api.get<TraderOrder[]>("/api/trader/orders", { params: { limit } })).data;
}

export async function getTraderFills(limit = 30): Promise<TraderFill[]> {
  return (await api.get<TraderFill[]>("/api/trader/fills", { params: { limit } })).data;
}

export async function getTraderDecisions(opts: { limit?: number; signalsOnly?: boolean } = {}): Promise<TraderDecision[]> {
  const params = { limit: opts.limit ?? 40, ...(opts.signalsOnly ? { signals: "1" } : {}) };
  return (await api.get<TraderDecision[]>("/api/trader/decisions", { params })).data;
}

export async function getTraderPerformance(): Promise<TraderPerformanceRow[]> {
  return (await api.get<TraderPerformanceRow[]>("/api/trader/performance")).data;
}

export async function getTraderRiskEvents(limit = 20): Promise<TraderRiskEvent[]> {
  return (await api.get<TraderRiskEvent[]>("/api/trader/risk-events", { params: { limit } })).data;
}
