const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export type Countdown =
  | {
      status: "upcoming";
      /** KST 달력 기준 남은 날 수 (D-N 의 N) */
      dDay: number;
      days: number;
      hours: number;
      minutes: number;
      seconds: number;
    }
  | { status: "today" }
  | { status: "past"; daysSince: number };

/** KST 달력의 "몇 번째 날" — 기기 시간대와 무관하다. */
function kstDayIndex(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
}

export function getCountdown(targetMs: number, nowMs: number): Countdown {
  const dayDiff = kstDayIndex(targetMs) - kstDayIndex(nowMs);

  if (dayDiff === 0) return { status: "today" };
  if (dayDiff < 0) return { status: "past", daysSince: -dayDiff };

  const remaining = Math.max(0, targetMs - nowMs);
  return {
    status: "upcoming",
    dDay: dayDiff,
    days: Math.floor(remaining / DAY_MS),
    hours: Math.floor((remaining % DAY_MS) / HOUR_MS),
    minutes: Math.floor((remaining % HOUR_MS) / MINUTE_MS),
    seconds: Math.floor((remaining % MINUTE_MS) / 1000),
  };
}
