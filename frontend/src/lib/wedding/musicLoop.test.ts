import { describe, expect, it } from "vitest";

import { buildLoop, EIGHTH_SEC, LOOP_EIGHTHS, midiToHz } from "./musicLoop";

describe("buildLoop", () => {
  const loop = buildLoop();

  it("8마디 × 6개 8분음표 = 48, 약 19.2초 루프", () => {
    expect(LOOP_EIGHTHS).toBe(48);
    expect(LOOP_EIGHTHS * EIGHTH_SEC).toBeCloseTo(19.2);
  });

  it("모든 음이 루프 안에서 시작한다", () => {
    for (const e of loop) {
      expect(e.at).toBeGreaterThanOrEqual(0);
      expect(e.at).toBeLessThan(LOOP_EIGHTHS);
    }
  });

  it("음높이는 MIDI 36~96, 세기는 0~1, 잦아드는 시간은 양수", () => {
    for (const e of loop) {
      expect(e.midi).toBeGreaterThanOrEqual(36);
      expect(e.midi).toBeLessThanOrEqual(96);
      expect(e.velocity).toBeGreaterThan(0);
      expect(e.velocity).toBeLessThanOrEqual(1);
      expect(e.decay).toBeGreaterThan(0);
    }
  });

  it("시작 순서로 정렬돼 있다 (스케줄러가 앞에서부터 꺼낸다)", () => {
    for (let i = 1; i < loop.length; i++) {
      expect(loop[i].at).toBeGreaterThanOrEqual(loop[i - 1].at);
    }
  });

  it("마디마다 베이스 하나", () => {
    expect(loop.filter((e) => e.voice === "bass")).toHaveLength(8);
  });

  it("호출할 때마다 같은 루프 (결정적)", () => {
    expect(buildLoop()).toEqual(loop);
  });
});

describe("midiToHz", () => {
  it("A4 = 440Hz, 한 옥타브 위는 두 배", () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(81)).toBeCloseTo(880);
    expect(midiToHz(60)).toBeCloseTo(261.63, 1);
  });
});
