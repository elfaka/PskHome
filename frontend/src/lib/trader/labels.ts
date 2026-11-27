/**
 * /trader 화면의 한글 이름·설명 — 전략, 신호, 위험 관리 결과, 거부 사유, 점수 항목, 활동 종류.
 * 엔진이 남기는 코드(영문)는 바꾸지 않고 화면에서만 한글로 보여준다.
 */

export interface StrategyMeta {
  /** 한글 이름 */
  label: string;
  /** "전략"(신호를 내는 쪽) 또는 "규칙"(위험 관리가 실행하는 청산) */
  kind: "전략" | "규칙";
  /** 한 줄 요약 */
  summary: string;
  /** 조금 더 자세한 설명 */
  description: string;
}

export const STRATEGY_META: Record<string, StrategyMeta> = {
  ma_cross: {
    label: "이동평균 교차",
    kind: "전략",
    summary: "짧은 이동평균이 긴 이동평균을 위로 뚫으면 사고, 아래로 뚫으면 판다",
    description:
      "1분봉 종가의 짧은 이동평균이 긴 이동평균을 아래에서 위로 넘으면(골든크로스) 매수, 위에서 아래로 내려가면(데드크로스) 보유분을 매도합니다. " +
      "추세가 바뀌는 순간을 잡는 단순한 규칙이라 횡보장에서는 신호가 잦고 손실이 날 수 있습니다.",
  },
  intraday_score: {
    label: "장중 점수",
    kind: "전략",
    summary: "가격·수급·시장·뉴스를 100점으로 매겨 80점 이상이면 산다",
    description:
      "가격(기술 지표 30점)·맥락(수급 25·코스피 20·VIX 15)·이슈(뉴스·공시 10점)를 합쳐 100점 만점으로 매깁니다. " +
      "80점 이상이고 VWAP 위·거래량 1.5배 이상이면 매수, 30점 이하로 떨어지면 청산합니다. 65점 이상은 매수 관찰입니다.",
  },
  risk_exit: {
    label: "손절·목표가 청산",
    kind: "규칙",
    summary: "위험 관리가 정한 손절가·목표가에 닿으면 바로 판다",
    description:
      "매수할 때 위험 관리가 ATR(1분봉 평균 변동폭)로 손절가·목표가를 정해 둡니다. 시세가 어느 한쪽에 닿으면 전략과 상관없이 시장가로 청산합니다.",
  },
  eod_exit: {
    label: "장마감 청산",
    kind: "규칙",
    summary: "정해진 시각에 보유분을 모두 판다",
    description: "장 마감 전 설정한 시각(기본 15:15)이 되면 다음 날로 넘기지 않도록 보유분을 모두 시장가로 청산합니다.",
  },
};

export function strategyLabel(id: string | null | undefined): string {
  if (!id) return "—";
  return STRATEGY_META[id]?.label ?? id;
}

// ── 신호 ─────────────────────────────────────────────────────────────────────

export const ACTION_LABEL: Record<string, string> = {
  BUY: "매수",
  SELL: "매도",
  EXIT: "청산",
  HOLD: "보유 유지",
  WAIT: "관망",
};

export function actionLabel(a: string): string {
  return ACTION_LABEL[a] ?? a;
}

/** 매수 빨강 · 매도/청산 파랑 · 나머지 중립 (국내 관례) */
export function actionTone(a: string): "up" | "down" | "flat" {
  if (a === "BUY") return "up";
  if (a === "SELL" || a === "EXIT") return "down";
  return "flat";
}

// ── 위험 관리 결과 ───────────────────────────────────────────────────────────

export const RISK_RESULT: Record<string, { label: string; tone: "success" | "warning" | "neutral" | "accent" }> = {
  APPROVED: { label: "주문 승인", tone: "success" },
  REJECTED: { label: "거부", tone: "warning" },
  DUPLICATE: { label: "중복 — 이미 주문함", tone: "neutral" },
  SHADOW: { label: "기록만 (그림자)", tone: "accent" },
  STRATEGY_OFF: { label: "전략 꺼짐 — 매수 안 함", tone: "neutral" },
};

/** 위험 관리 거부 코드 → 한글 */
export const REJECT_TEXT: Record<string, string> = {
  LOW_RISK_REWARD: "손익비 부족",
  WIDE_SPREAD: "호가 스프레드 넓음",
  MAX_ORDER_VALUE: "1회 주문 한도",
  MAX_POSITION_VALUE: "종목 보유 한도",
  MAX_OPEN_POSITIONS: "동시 보유 종목 수 한도",
  DAILY_LOSS_LIMIT: "하루 손실 한도",
  INSUFFICIENT_CASH: "현금 부족",
  INSUFFICIENT_POSITION: "매도 수량 부족",
  NO_STOP: "손절가 계산 불가 (ATR 없음)",
  NEAR_UPPER_LIMIT: "상한가 근접",
  NO_PRICE_LIMIT: "상·하한가 정보 없음",
  ENTRY_CUTOFF: "신규 진입 마감 이후",
  MARKET_CLOSED: "장 시간 외",
  STALE_QUOTE: "오래된 시세",
  NO_QUOTE: "시세 없음",
  NO_DAY_BASELINE: "오늘 기준 평가금액 없음",
  HALTED: "긴급 정지 중",
  INVALID_QTY: "수량 오류",
  DATA_UNHEALTHY: "데이터 이상",
  DB_UNHEALTHY: "DB 이상",
  ENGINE_ERROR: "엔진 오류",
};

/** "LOW_RISK_REWARD: 비용 차감 손익비 0.92 < 1.5" → { label: "손익비 부족", message: "비용 차감 손익비 0.92 < 1.5" } */
export function splitRiskReason(reason: string | null | undefined): { label: string | null; message: string | null } {
  if (!reason) return { label: null, message: null };
  const m = /^([A-Z_]{3,}):\s*(.*)$/.exec(reason);
  if (!m) return { label: null, message: reason };
  return { label: REJECT_TEXT[m[1]] ?? m[1], message: m[2] || null };
}

// ── 점수 항목 ────────────────────────────────────────────────────────────────

export const PART_LABEL: Record<string, string> = {
  technical: "가격 (기술 지표)",
  flow: "수급 (외국인·기관)",
  market: "시장 (코스피)",
  global: "글로벌 (VIX)",
  news: "뉴스·공시",
};

export const PART_ORDER = ["technical", "flow", "market", "global", "news"] as const;

// ── 판단 사유 (영문으로 남는 이동평균 교차 사유를 한글로) ─────────────────────

const MA_REASONS: [RegExp, string | ((m: RegExpExecArray) => string)][] = [
  [/^golden cross but already holding$/, "골든크로스지만 이미 보유 중이라 더 사지 않음"],
  [/^golden cross but order value < 1 share$/, "골든크로스지만 1회 매수 금액으로 1주를 살 수 없음"],
  [/^golden cross$/, "골든크로스 — 짧은 이동평균이 긴 이동평균을 위로 돌파"],
  [/^dead cross but nothing to sell$/, "데드크로스지만 팔 보유분이 없음"],
  [/^dead cross$/, "데드크로스 — 짧은 이동평균이 긴 이동평균을 아래로 돌파"],
  [/^no cross$/, "교차 없음 — 추세 그대로"],
  [/^first full window$/, "첫 판단 — 이동평균이 다 모여 다음 봉부터 교차를 봄"],
  [/^warming up (\d+)\/(\d+)$/, (m) => `지표 준비 중 (${m[1]}/${m[2]}봉)`],
];

export function reasonKo(reason: string | null | undefined): string {
  if (!reason) return "—";
  const r = reason.trim();
  for (const [re, out] of MA_REASONS) {
    const m = re.exec(r);
    if (m) return typeof out === "string" ? out : out(m);
  }
  return r;
}

// ── 활동 종류 ────────────────────────────────────────────────────────────────

export const CATEGORY_LABEL: Record<string, string> = {
  trade: "체결",
  order: "주문",
  risk: "위험 관리",
  control: "조작",
  settings: "설정",
  universe: "종목",
  system: "시스템",
  data: "데이터",
};

/** "web:owner" → "화면 · owner", "cli" → "명령줄", "engine" → "엔진" */
export function actorLabel(by: string | null | undefined): string | null {
  if (!by) return null;
  if (by.startsWith("web:")) return `화면 · ${by.slice(4)}`;
  if (by === "cli") return "명령줄";
  if (by === "engine" || by === "recovery") return "엔진";
  if (by.startsWith("seed:")) return "엔진 (첫 옮기기)";
  return by;
}

export const HORIZON_LABEL: Record<string, string> = { "5m": "5분 뒤", "15m": "15분 뒤", "30m": "30분 뒤", close: "장마감" };
