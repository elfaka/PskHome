import { describe, expect, it } from "vitest";

import {
  CARD_IN_ENVELOPE,
  cardRectOnScreen,
  type Geom,
  introLayout,
  SINK,
  TOP_SAFE,
} from "./introLayout";

// 390×844 폰에서 실측한 값과 비슷하게
const phone: Geom = {
  stageX: 27,
  stageY: 365,
  envW: 336,
  envH: 232,
  cardX: 39,
  cardY: 97,
  cardW: 312,
  vh: 844,
};
const CARD_H = 436;

// 폴더블 메인 가로 — 봉투는 오른쪽, 카드는 왼쪽 단
const unfoldedLandscape: Geom = {
  stageX: 480,
  stageY: 83,
  envW: 374,
  envH: 258,
  cardX: 163,
  cardY: 52,
  cardW: 320,
  vh: 540,
};

describe("introLayout", () => {
  for (const [name, g] of [
    ["폰", phone],
    ["폴더블 가로", unfoldedLandscape],
  ] as const) {
    describe(name, () => {
      it("presenting: 사본 카드가 첫 화면 카드와 정확히 겹친다", () => {
        const r = cardRectOnScreen(introLayout("presenting", g), g, CARD_H);
        expect(r.left).toBeCloseTo(g.cardX, 6);
        expect(r.top).toBeCloseTo(g.cardY, 6);
        expect(r.width).toBeCloseTo(g.cardW, 6);
      });

      it("sealed: 카드는 봉투 폭의 86%, 가운데, 봉투 안에서 시작", () => {
        const r = cardRectOnScreen(introLayout("sealed", g), g, CARD_H);
        expect(r.width).toBeCloseTo(g.envW * CARD_IN_ENVELOPE, 6);
        const center = r.left + r.width / 2;
        expect(center).toBeCloseTo(g.stageX + g.envW / 2, 6);
        expect(r.top).toBeGreaterThan(g.stageY);
        // 좌우로 봉투 밖에 나가지 않는다 (옆으로는 클립하지 않으므로)
        expect(r.left).toBeGreaterThan(g.stageX);
        expect(r.left + r.width).toBeLessThan(g.stageX + g.envW);
      });

      it("rising: 카드 윗부분이 봉투 위로 나오지만, 아랫부분은 봉투 안(아랫변 위)에 남는다", () => {
        const l = introLayout("rising", g);
        const r = cardRectOnScreen(l, g, CARD_H);
        const envTop = g.stageY + l.envelope.y;
        const envBottom = envTop + g.envH;
        expect(r.top).toBeLessThan(envTop - 50); // 눈에 띄게 꺼내져 있다
        expect(r.top).toBeGreaterThanOrEqual(TOP_SAFE - 1e-9); // 화면 위로 잘리지 않는다
        expect(r.top + r.height).toBeGreaterThan(envBottom); // 아래는 여전히 봉투 속(클립됨)
      });

      it("클립의 아랫변은 봉투 아랫변을 따라간다", () => {
        const rising = introLayout("rising", g);
        expect(rising.clipPath).toContain(`-${g.envH * SINK}px`);
        const presenting = introLayout("presenting", g);
        expect(presenting.clipPath).toContain(`-${presenting.envelope.y}px`);
      });

      it("presenting: 봉투는 화면 아래로 완전히 빠진다", () => {
        const l = introLayout("presenting", g);
        expect(g.stageY + l.envelope.y).toBeGreaterThan(g.vh);
        expect(l.envelope.opacity).toBe(0);
      });
    });
  }

  it("opening 은 sealed 와 같다 (덮개만 움직인다)", () => {
    expect(introLayout("opening", phone)).toEqual(introLayout("sealed", phone));
  });
});
