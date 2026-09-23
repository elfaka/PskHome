import type { IntroPhase } from "./introMachine";

/** 봉투 안 카드의 폭 = 봉투 폭 × 이 값. 앞주머니 좌우 가장자리에 가려지도록 여유를 둔다 */
export const CARD_IN_ENVELOPE = 0.86;
/** 봉투 안에서 카드 윗변의 위치 (봉투 높이 비율) */
export const CARD_TOP = 0.06;
/** rising 에서 카드를 꺼내는 거리 / 그동안 봉투가 내려가는 거리 (봉투 높이 비율) */
export const PULL = 0.5;
export const SINK = 0.18;
/** 봉투가 화면 아래로 완전히 빠지도록 더하는 여유(px) */
export const DROP_MARGIN = 80;
/** 꺼낸 카드 윗변이 화면 위에서 최소 이만큼 떨어져 있게 한다(px) — 높이가 낮은 가로 화면 대비 */
export const TOP_SAFE = 12;
/** 클립이 한쪽으로 풀릴 때 쓰는 충분히 큰 값(px) */
const FAR = 3000;

/** 화면 좌표(px). 무대(봉투 자리)와 첫 화면 카드를 같은 기준으로 잰다 */
export type Geom = {
  stageX: number;
  stageY: number;
  envW: number;
  envH: number;
  cardX: number;
  cardY: number;
  cardW: number;
  vh: number;
};

export type IntroLayout = {
  /** 봉투 레이어들(뒤판·덮개·앞주머니)이 함께 움직이는 값 */
  envelope: { y: number; opacity: number };
  /**
   * 사본 카드의 transform. 카드는 무대 왼쪽 위(0,0)에 첫 화면 카드와 같은 폭으로 놓이고
   * transform-origin 이 "위 가운데" 다.
   */
  card: { x: number; y: number; scale: number };
  /** 카드 레이어(무대 크기)의 clip-path — 봉투 아랫변 밖으로 카드가 보이지 않게 한다 */
  clipPath: string;
};

/**
 * 단계별 목표값. 순수 함수라 렌더 없이 테스트한다.
 * presenting 에서 카드는 첫 화면 카드와 정확히 같은 사각형이 되어야 인계가 끊기지 않는다.
 */
export function introLayout(phase: IntroPhase, g: Geom): IntroLayout {
  const cardOut = phase === "rising" || phase === "presenting" || phase === "done";
  const leaving = phase === "presenting" || phase === "done";

  const dropPx = g.vh - g.stageY + DROP_MARGIN;
  const sinkPx = g.envH * SINK;

  const s0 = (g.envW * CARD_IN_ENVELOPE) / g.cardW;
  const insideX = g.envW / 2 - g.cardW / 2;
  const insideY = g.envH * CARD_TOP;
  // 폴더블 가로(높이 ~540)처럼 봉투가 화면 위쪽에 있으면 다 꺼냈을 때 카드가 화면 밖으로 잘린다
  const pullPx = Math.max(0, Math.min(g.envH * PULL, g.stageY + insideY - TOP_SAFE));

  if (leaving) {
    return {
      envelope: { y: dropPx, opacity: 0 },
      card: { x: g.cardX - g.stageX, y: g.cardY - g.stageY, scale: 1 },
      clipPath: `inset(-${FAR}px -${FAR}px -${dropPx}px -${FAR}px)`,
    };
  }
  if (cardOut) {
    return {
      envelope: { y: sinkPx, opacity: 1 },
      card: { x: insideX, y: insideY - pullPx, scale: s0 },
      clipPath: `inset(-${FAR}px 0px -${sinkPx}px 0px)`,
    };
  }
  return {
    envelope: { y: 0, opacity: 1 },
    card: { x: insideX, y: insideY, scale: s0 },
    clipPath: `inset(-${FAR}px 0px 0px 0px)`,
  };
}

/** transform(translate → scale, origin 위 가운데) 을 적용한 뒤 카드의 화면 사각형 */
export function cardRectOnScreen(
  layout: IntroLayout,
  g: Geom,
  cardH: number,
): { left: number; top: number; width: number; height: number } {
  const { x, y, scale } = layout.card;
  const width = g.cardW * scale;
  return {
    left: g.stageX + x + (g.cardW - width) / 2,
    top: g.stageY + y,
    width,
    height: cardH * scale,
  };
}
