import type { FearGreedLevel } from "@/api/stockSim";

/**
 * 공포·탐욕 지수 표기. 구간은 백엔드 `market.service.ts` 의 `fearGreedLevel` 과 같다.
 * 이 화면의 상승 빨강 / 하락 파랑 관례에 맞춰 공포는 파랑, 탐욕은 빨강이다.
 */

export const FEAR_GREED_LABEL: Record<FearGreedLevel, string> = {
  EXTREME_FEAR: "극단적 공포",
  FEAR: "공포",
  NEUTRAL: "중립",
  GREED: "탐욕",
  EXTREME_GREED: "극단적 탐욕",
};

/** 게이지 구간 경계 (점수) */
export const FEAR_GREED_BANDS: { level: FearGreedLevel; from: number; to: number }[] = [
  { level: "EXTREME_FEAR", from: 0, to: 25 },
  { level: "FEAR", from: 25, to: 45 },
  { level: "NEUTRAL", from: 45, to: 56 },
  { level: "GREED", from: 56, to: 76 },
  { level: "EXTREME_GREED", from: 76, to: 100 },
];

export function fearGreedLevel(score: number): FearGreedLevel {
  if (score < 25) return "EXTREME_FEAR";
  if (score < 45) return "FEAR";
  if (score <= 55) return "NEUTRAL";
  if (score <= 75) return "GREED";
  return "EXTREME_GREED";
}

export const FEAR_GREED_TEXT: Record<FearGreedLevel, string> = {
  EXTREME_FEAR: "text-info-soft-fg",
  FEAR: "text-info-soft-fg",
  NEUTRAL: "text-fg-muted",
  GREED: "text-danger-soft-fg",
  EXTREME_GREED: "text-danger-soft-fg",
};

/** SVG 게이지 구간 색 */
export const FEAR_GREED_STROKE: Record<FearGreedLevel, string> = {
  EXTREME_FEAR: "stroke-info",
  FEAR: "stroke-info-soft",
  NEUTRAL: "stroke-line-strong",
  GREED: "stroke-danger-soft",
  EXTREME_GREED: "stroke-danger",
};
