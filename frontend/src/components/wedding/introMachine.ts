export type IntroPhase = "sealed" | "opening" | "rising" | "unfolding" | "done";

export type IntroEvent =
  | { type: "OPEN"; reducedMotion: boolean }
  /**
   * `from` 은 이 이벤트를 보낸 쪽이 알고 있던 단계다.
   * 애니메이션 완료 콜백과 안전 타이머가 같은 단계에서 둘 다 보내도
   * 현재 단계와 다르면 무시되므로 한 번만 진행된다.
   */
  | { type: "ADVANCE"; from: IntroPhase };

const NEXT: Partial<Record<IntroPhase, IntroPhase>> = {
  opening: "rising",
  rising: "unfolding",
  unfolding: "done",
};

/** 단계별 연출 최대 길이. 이 시간 + 여유가 지나도 완료 이벤트가 없으면 강제로 넘긴다. */
export const PHASE_MAX_MS: Partial<Record<IntroPhase, number>> = {
  opening: 1100,
  rising: 900,
  unfolding: 1500,
};

export const SAFETY_MARGIN_MS = 500;

export function introReducer(phase: IntroPhase, event: IntroEvent): IntroPhase {
  switch (event.type) {
    case "OPEN":
      if (phase !== "sealed") return phase;
      return event.reducedMotion ? "done" : "opening";
    case "ADVANCE":
      if (event.from !== phase) return phase;
      return NEXT[phase] ?? phase;
  }
}
