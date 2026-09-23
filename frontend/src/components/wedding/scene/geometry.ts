/*
  첫 화면 장면의 좌표계. 장면은 가로 100 × 세로 150 단위(2:3)이고,
  CSS 에서는 left/width 는 폭의 %, top 은 높이의 % 로 바꿔 쓴다.
  Bouquet 의 SVG(viewBox 0 0 100 150)도 같은 단위라 꽃과 HTML 요소가 정확히 맞물린다.
*/

export const STAGE_W = 100;
export const STAGE_H = 150;

/** 봉투 가로세로비 */
export const ENV_RATIO = 1.45;

export type Box = { x: number; y: number; w: number };

/** 봉투 — 장면 아래쪽. 봉인 상태에서도 같은 자리라 봉투는 움직이지 않는다 */
export const ENV: Box = { x: 4, y: 70, w: 92 };
export const ENV_BOTTOM = ENV.y + ENV.w / ENV_RATIO;

/**
 * 봉투 중앙 스티커 — 덮개 끝(봉투 윗변 + 덮개 높이 61% ≈ 38.7)과 앞주머니 V 끝(≈104) 사이에 걸친다.
 * 중심 y 와 지름(장면 폭 %)
 */
export const STICKER_Y = ENV.y + 35;
export const STICKER_W = 19;

/** 카드(2:3) — 열린 뒤 쉬는 자리. 아랫부분은 앞주머니 뒤에 꽂혀 있다 */
export const CARD: Box = { x: 26, y: 22, w: 58 };
export const CARD_H = CARD.w * 1.5;
/** 봉인 상태에서 카드는 봉투 윗변 바로 아래까지 내려가 있다 → 카드 높이 대비 이동량(%) */
export const CARD_TUCK_PCT = ((ENV.y + 2 - CARD.y) / CARD_H) * 100;

/** LP — 봉투 아랫변에 걸친다. 곡선 문구가 봉투 아래 아이보리 바탕에 오도록 */
// 곡선 문구 양 끝 글자의 윗변 ≈ LP 윗변 + 0.85 × LP 폭 → 봉투 아랫변(≈133.4)보다 약 4단위 아래
export const LP: Box = { x: 6, y: 110, w: 32 };

/** 폴라로이드 두 장 — 카드 뒤 왼쪽 */
export const PHOTOS: (Box & { rot: number })[] = [
  { x: 3, y: 12, w: 36, rot: -7 },
  { x: 7, y: 42, w: 34, rot: 5 },
];

/** 카드 레이어 클립: 봉투 아랫변 밖으로 카드가 보이지 않게 (좌우는 봉투 폭) */
export const CARD_CLIP = `inset(-20% ${ENV.x}% ${(((STAGE_H - ENV_BOTTOM) / STAGE_H) * 100).toFixed(2)}% ${ENV.x}%)`;

export function place(b: Box): React.CSSProperties {
  return {
    left: `${b.x}%`,
    top: `${((b.y / STAGE_H) * 100).toFixed(3)}%`,
    width: `${b.w}%`,
  };
}
