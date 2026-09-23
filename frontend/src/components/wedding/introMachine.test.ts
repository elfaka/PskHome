import { describe, expect, it } from "vitest";

import { type IntroPhase, introReducer } from "./introMachine";

const open = { type: "OPEN", reducedMotion: false } as const;
const advance = (from: IntroPhase) => ({ type: "ADVANCE", from }) as const;

describe("introReducer", () => {
  it("sealed → opening → rising → blooming → done", () => {
    let p: IntroPhase = "sealed";
    p = introReducer(p, open);
    expect(p).toBe("opening");
    p = introReducer(p, advance("opening"));
    expect(p).toBe("rising");
    p = introReducer(p, advance("rising"));
    expect(p).toBe("blooming");
    p = introReducer(p, advance("blooming"));
    expect(p).toBe("done");
  });

  it("연타: 열리는 중 OPEN 은 무시", () => {
    expect(introReducer("opening", open)).toBe("opening");
    expect(introReducer("rising", open)).toBe("rising");
    expect(introReducer("done", open)).toBe("done");
  });

  it("reduced motion 이면 바로 done", () => {
    expect(introReducer("sealed", { type: "OPEN", reducedMotion: true })).toBe(
      "done",
    );
  });

  it("완료 콜백과 안전 타이머가 같은 단계에서 둘 다 와도 한 번만 진행", () => {
    let p: IntroPhase = "opening";
    p = introReducer(p, advance("opening"));
    p = introReducer(p, advance("opening"));
    expect(p).toBe("rising");
  });

  it("지난 단계의 늦은 ADVANCE 는 무시", () => {
    expect(introReducer("blooming", advance("opening"))).toBe("blooming");
  });

  it("sealed / done 에서 ADVANCE 는 아무 일도 없다", () => {
    expect(introReducer("sealed", advance("sealed"))).toBe("sealed");
    expect(introReducer("done", advance("done"))).toBe("done");
  });
});
