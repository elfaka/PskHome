/**
 * sealed   봉투 닫힘
 * opening  문구·모노그램이 사라지고 덮개가 넘어간다
 * rising   카드가 봉투에서 올라온다 (봉투에 꽂힌 채)
 * blooming 카드 뒤로 부케가 피고 사진·LP 가 나온다
 * done     스크롤 잠금 해제, LP 사용 가능
 */
export type IntroPhase = "sealed" | "opening" | "rising" | "blooming" | "done";

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
  rising: "blooming",
  blooming: "done",
};

/** 단계별 연출 최대 길이. 이 시간 + 여유가 지나도 완료 이벤트가 없으면 강제로 넘긴다. */
export const PHASE_MAX_MS: Partial<Record<IntroPhase, number>> = {
  opening: 1100,
  rising: 1000,
  blooming: 1800,
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
