import { api } from "./client";

/** 자동매매(/trader) 본인 전용 로그인. 백엔드 `modules/trader` 와 계약이 묶여 있다. */
export type TraderMe =
  | { authenticated: false; totpRequired?: boolean }
  | { authenticated: true; username: string; totpEnabled?: boolean; stepUpUntil?: string | null };

export async function getTraderMe(): Promise<TraderMe> {
  const res = await api.get<TraderMe>("/api/trader/auth/me");
  return res.data;
}

export async function traderLogin(username: string, password: string, code?: string): Promise<TraderMe> {
  const res = await api.post<TraderMe>("/api/trader/auth/login", { username, password, ...(code ? { code } : {}) });
  return res.data;
}

/** 2단계 인증 — 맞으면 5분 동안 재개·전략 켜기·설정 변경을 할 수 있다. */
export async function traderStepUp(code: string): Promise<{ stepUpUntil: string }> {
  return (await api.post<{ stepUpUntil: string }>("/api/trader/auth/step-up", { code })).data;
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
  /** 총자산 대비 비중 (비율) */
  weight?: Dec | null;
  /** 종목 보유 한도 대비 사용률 (비율) */
  limitUsage?: Dec | null;
}

export interface TraderSummary {
  account: { name: string; broker: string; createdAt: string | null } | null;
  cash: Dec | null;
  marketValue: Dec | null;
  equity: Dec | null;
  dayStartEquity: Dec | null;
  dayPnl: Dec | null;
  initialCash?: Dec | null;
  cumReturn?: Dec | null;
  dailyLossLimit?: Dec | null;
  lossUsage?: Dec | null;
  maxPositionValue?: Dec | null;
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

// ── 상태 · 전략 · 추이 · 활동 ────────────────────────────────────────────────

export type EngineRunState = "running" | "stale" | "unknown";

export interface TraderAlert {
  level: "error" | "warn" | "info";
  code: string;
  message: string;
}

/** 운영 설정 — 원본은 DB(engine_state settings). trader.env 는 처음 한 번 옮길 때만 쓴다 */
export interface TraderSettingsState {
  /** DB 에 운영 설정이 있다. false 면 옛 엔진이라 저장할 수 없다 */
  ready: boolean;
  /** DB 에 저장된 값 (시각은 null = 끔) */
  values: Record<string, string | null>;
  /** 엔진이 지금 쓰는 값 */
  effective: Record<string, string | null>;
  savedVersion: number;
  savedAt: string | null;
  savedBy: string | null;
  appliedVersion: number;
  pending: { version: number; at: string | null } | null;
  rejected: { version: number; reason: string; at: string | null } | null;
  previousVersion: number | null;
  /** trader.env 에 남아 있지만 무시되는 키 */
  envIgnored: string[];
  info: {
    mode?: string;
    feed?: string;
    account?: string;
    symbols?: string[];
    strategies?: { id: string; shadow: boolean }[];
    paper_initial_cash?: string;
    bar_interval_seconds?: number;
    market_open?: string;
    market_close?: string;
  } | null;
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
  /** 09:00~15:30 (마감 동시호가 포함) */
  marketOpen: boolean;
  /** continuous 정규장 · closing_auction 마감 동시호가(15:20~15:30, 체결 없음) · closed. 옛 백엔드면 없다 */
  marketPhase?: "continuous" | "closing_auction" | "closed";
  switches: Record<string, boolean>;
  settings: TraderSettingsState | null;
  alerts: TraderAlert[];
}

export interface TraderEquity {
  /** drawdown: 그때까지 최고점 대비 하락폭 (비율, 0 이하) */
  points: { date: string; equity: Dec; drawdown?: Dec | null }[];
  mdd: Dec | null;
  /** 지금 총자산과 그 하락폭 */
  current?: { equity: Dec; drawdown: Dec | null } | null;
}

export interface TraderStrategyRow {
  id: string;
  shadow: boolean;
  enabled: boolean;
  today: { decisions: number; signals: number; orders: number; fills: number; rejected: number };
  lastDecisionAt: string | null;
  recent: { ts: string | null; symbol: string; action: string; riskResult: string | null }[];
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

export async function getTraderStatus(): Promise<TraderStatus> {
  return (await api.get<TraderStatus>("/api/trader/status")).data;
}

export async function getTraderEquity(): Promise<TraderEquity> {
  return (await api.get<TraderEquity>("/api/trader/equity")).data;
}

export async function getTraderStrategies(): Promise<TraderStrategyRow[]> {
  return (await api.get<TraderStrategyRow[]>("/api/trader/strategies")).data;
}

// ── 그래프·지표 ─────────────────────────────────────────────────────────────

export type ChartInterval = 60 | 300;

export interface TraderBar {
  t: string;
  o: Dec;
  h: Dec;
  l: Dec;
  c: Dec;
  v: Dec;
}

export interface TraderIndicators {
  barTs: string | null;
  close: Dec | null;
  vwap: Dec | null;
  /** (종가 − VWAP) ÷ VWAP (비율) */
  vwapGap: Dec | null;
  sma20: Dec | null;
  rsi14: Dec | null;
  macdHist: Dec | null;
  atr14: Dec | null;
  volumeRatio: Dec | null;
}

export interface TraderChart {
  symbol: string;
  interval: number;
  /** 그린 거래일 (KST). 봉이 없으면 null */
  tradeDate: string | null;
  symbols: string[];
  bars: TraderBar[];
  /** 지표선 (1분봉 기준 값) */
  lines: { t: string; vwap: Dec | null; sma20: Dec | null }[];
  /** t = 체결이 속한 봉의 시작 시각 */
  fills: { t: string; ts: string | null; side: string; qty: Dec; price: Dec; strategyId: string | null }[];
  signals: { t: string; ts: string | null; strategyId: string; action: string; shadow: boolean; riskResult: string | null }[];
  position: { qty: Dec; avgPrice: Dec; stopLoss: Dec | null; takeProfit: Dec | null } | null;
  indicators: TraderIndicators | null;
}

export interface TraderScorePart {
  points: Dec | null;
  max: Dec | null;
  note: string;
  available: boolean;
}

export interface TraderScores {
  symbol: string;
  tradeDate: string | null;
  thresholds: { buy: Dec; watch: Dec; exit: Dec };
  points: { t: string; action: string; total: Dec | null; price: Dec | null; context: Dec | null; issue: Dec | null }[];
  latest: { ts: string | null; parts: Record<string, TraderScorePart> } | null;
}

export interface TraderTripStats {
  count: number;
  wins: number;
  winRate: Dec | null;
  netPnl: Dec | null;
  avgPnl: Dec | null;
}

export interface TraderStats {
  today: {
    fills: number;
    buys: number;
    sells: number;
    commission: Dec;
    tax: Dec;
    slippage: Dec;
    costs: Dec;
    avgPlannedRiskReward: Dec | null;
  };
  /** 청산된 거래 (보유 0 → 0). 손익은 수수료·세금 차감 */
  trips: { today: TraderTripStats; all: TraderTripStats };
  /** 실현 손익 누적 (비용 차감 전) · 평가 손익 */
  realizedPnl: Dec | null;
  unrealizedPnl: Dec | null;
  rejections: { code: string; count: number; sample: string | null }[];
}

export async function getTraderChart(symbol: string, interval: ChartInterval): Promise<TraderChart> {
  return (await api.get<TraderChart>("/api/trader/chart", { params: { symbol, interval } })).data;
}

export async function getTraderScores(symbol: string): Promise<TraderScores> {
  return (await api.get<TraderScores>("/api/trader/scores", { params: { symbol } })).data;
}

export async function getTraderStats(): Promise<TraderStats> {
  return (await api.get<TraderStats>("/api/trader/stats")).data;
}

export async function getTraderActivity(limit = 50): Promise<TraderActivity[]> {
  return (await api.get<TraderActivity[]>("/api/trader/activity", { params: { limit } })).data;
}

// ── 조작 (엔진이 약 5초 안에 반영) ───────────────────────────────────────────

export async function traderHalt(reason: string): Promise<void> {
  await api.post("/api/trader/control/halt", { reason });
}

export async function traderResume(note: string): Promise<void> {
  await api.post("/api/trader/control/resume", { note });
}

export async function traderSetStrategy(id: string, enabled: boolean): Promise<void> {
  await api.post(`/api/trader/control/strategies/${encodeURIComponent(id)}`, { enabled });
}

/** 바꾼 항목만 보낸다 (시각을 끄려면 null). 서버가 지금 값에 합쳐 전체를 검증하고 새 버전으로 저장한다 */
export async function traderUpdateSettings(
  values: Record<string, string | null>
): Promise<{ version: number; values: Record<string, string | null> }> {
  return (await api.put<{ version: number; values: Record<string, string | null> }>("/api/trader/control/settings", { values })).data;
}

/** 직전 설정으로 되돌린다 (그 값을 새 버전으로 저장) */
export async function traderRevertSettings(): Promise<{ version: number; restored: number }> {
  return (await api.post<{ version: number; restored: number }>("/api/trader/control/settings/revert", {})).data;
}
