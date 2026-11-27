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
  /** 점수 전략의 항목별 점수 (technical·flow·market·global·news → {points, max, note, available}) */
  parts: Record<string, { points: Dec | null; max: Dec | null; note: string; available: boolean }> | null;
  /** 이동평균 교차 전략의 값 (짧은·긴 이동평균, 차이) */
  ma: { fast: Dec | null; slow: Dec | null; diff: Dec | null } | null;
  /** 이렇게 되면 판단이 무효 (점수 전략) */
  invalidation: string[] | null;
  validUntil: string | null;
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
  /** 운영 설정이 DB(engine_state settings)에 있다. false 면 옛 엔진이라 아직 trader.env 값을 쓰고 있다 (저장 불가) */
  ready: boolean;
  /** DB 에 저장된 값 (원본). ready=false 면 엔진 적용값 */
  values: Record<string, string | null>;
  /** 엔진이 지금 쓰는 값 */
  effective: Record<string, string | null>;
  savedVersion: number;
  savedAt: string | null;
  savedBy: string | null;
  appliedVersion: number;
  /** 저장됐지만 엔진이 아직 적용하지 않은 버전 (없으면 null) */
  pending: { version: number; at: string | null } | null;
  rejected: { version: number; reason: string; at: string | null } | null;
  /** 되돌릴 수 있는 직전 버전 */
  previousVersion: number | null;
  /** trader.env 에 남아 있지만 DB 값을 쓰느라 무시되는 키 */
  envIgnored: string[];
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
  /** 09:00~15:30 (마감 동시호가 포함) */
  marketOpen: boolean;
  /** continuous 정규장 · closing_auction 마감 동시호가(15:20~15:30, 체결 없음) · closed */
  marketPhase: "continuous" | "closing_auction" | "closed";
  switches: Record<string, boolean>;
  settings: TraderSettingsState | null;
  /** 오늘 볼 종목 (자동 선정·고정). watching = 엔진이 지금 시세를 보는 종목 (선정 밖 보유 종목 포함) */
  universe: {
    date: string | null;
    mode: string | null;
    source: string | null;
    at: string | null;
    symbols: { symbol: string; name: string | null; score: Dec | null; foreigner: Dec | null; institution: Dec | null; pinned: boolean }[];
    excluded: { symbol: string; name: string | null; reason: string }[];
    watching: string[];
  } | null;
  alerts: TraderAlert[];
}

export interface TraderEquityPoint {
  date: string;
  equity: Dec;
  /** 그때까지 최고점 대비 하락폭 (비율, 0 이하) */
  drawdown: Dec | null;
}

export interface TraderEquity {
  points: TraderEquityPoint[];
  /** 최대 낙폭 (비율, 0 이하). 일별 시작 평가금액 + 현재 총자산 기준 */
  mdd: Dec | null;
  /** 지금 총자산과 그 하락폭 (총자산을 모르면 null) */
  current: { equity: Dec; drawdown: Dec | null } | null;
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

export type TraderActivityCategory = "trade" | "order" | "risk" | "control" | "settings" | "universe" | "system" | "data";

export interface TraderActivity {
  id: string;
  ts: string | null;
  level: "error" | "warn" | "info";
  source: "fill" | "order" | "event";
  kind: string;
  symbol: string | null;
  /** 체결·주문·위험 관리·조작·설정·종목·시스템·데이터 */
  category: TraderActivityCategory;
  /** 한 줄 제목 (한글) */
  title: string;
  /** 자세한 내용 (한글, 없으면 null) */
  detail: string | null;
  /** 위험 관리 거부 코드 등 (화면이 한글 이름으로 바꾼다) */
  code: string | null;
  strategyId: string | null;
  /** 조작한 사람 (web:아이디, cli, engine ...) */
  by: string | null;
  /** 설정 변경 내역 (키·전·후). 화면이 설정 이름·단위로 보여준다 */
  diff: { key: string; before: string | null; after: string | null }[] | null;
  /** 같은 값이 연달아 나오면 화면이 한 줄로 묶는다 */
  groupKey: string;
  /** 제목 · 내용 (예전 화면 호환) */
  message: string;
}

// ── 그래프·지표 (종목 차트, 점수 추이, 오늘 통계) ───────────────────────────────

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
  /** (종가 − VWAP) ÷ VWAP (비율, SQL DECIMAL) */
  vwapGap: Dec | null;
  sma20: Dec | null;
  rsi14: Dec | null;
  macdHist: Dec | null;
  atr14: Dec | null;
  volumeRatio: Dec | null;
}

export interface TraderChart {
  symbol: string;
  /** 봉 주기 (초) */
  interval: number;
  /** 화면에 그린 거래일 (KST, YYYY-MM-DD). 봉이 없으면 null */
  tradeDate: string | null;
  /** 고를 수 있는 종목 */
  symbols: string[];
  bars: TraderBar[];
  /** 지표선 — 1분봉 기준 값을 봉 구간의 마지막 값으로 맞춘다 */
  lines: { t: string; vwap: Dec | null; sma20: Dec | null }[];
  /** t = 이 체결이 속한 봉의 시작 시각 */
  fills: { t: string; ts: string | null; side: string; qty: Dec; price: Dec; strategyId: string | null }[];
  signals: { t: string; ts: string | null; strategyId: string; action: string; shadow: boolean; riskResult: string | null }[];
  /** 보유 중이면 평균단가·손절·목표가 (마지막 매수 주문의 위험 관리 계산값) */
  position: { qty: Dec; avgPrice: Dec; stopLoss: Dec | null; takeProfit: Dec | null } | null;
  /** 가장 최근 판단 때의 지표 */
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
  /** 결합 규칙 기준 (엔진 scoring/combine.py 의 CombinationRule 기본값과 같다) */
  thresholds: { buy: Dec; watch: Dec; exit: Dec };
  points: { t: string; action: string; total: Dec | null; price: Dec | null; context: Dec | null; issue: Dec | null }[];
  /** 가장 최근 판단의 항목별 점수 (기술·수급·코스피·VIX·뉴스) */
  latest: { ts: string | null; parts: Record<string, TraderScorePart> } | null;
}

export interface TraderTripStats {
  /** 청산된 거래 수 (보유 0 → 0) */
  count: number;
  wins: number;
  winRate: Dec | null;
  /** 비용 차감 손익 합계·평균 */
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
    /** 수수료 + 세금 */
    costs: Dec;
    /** 오늘 승인된 매수의 계획 손익비 평균 */
    avgPlannedRiskReward: Dec | null;
  };
  trips: { today: TraderTripStats; all: TraderTripStats };
  /** 실현 손익 합계 (누적, 수수료·세금 차감 전 — 엔진 positions.realized_pnl) · 평가 손익 합계 (현재 시세) */
  realizedPnl: Dec | null;
  unrealizedPnl: Dec | null;
  /** 오늘 위험 관리가 막은 주문 의도 — 사유 코드별 건수 */
  rejections: { code: string; count: number; sample: string | null }[];
}
