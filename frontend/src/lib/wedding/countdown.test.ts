import { describe, expect, it } from "vitest";

import { getCountdown } from "./countdown";

const TARGET = Date.parse("2027-05-15T00:00:00+09:00");

describe("getCountdown", () => {
  it("하루 전 같은 시각이면 D-1, 남은 시간 24시간", () => {
    const now = Date.parse("2027-05-14T00:00:00+09:00");
    expect(getCountdown(TARGET, now)).toEqual({
      status: "upcoming",
      dDay: 1,
      days: 1,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });

  it("목표 1초 전은 아직 전날이라 D-1, 1초 남음", () => {
    const now = TARGET - 1000;
    expect(getCountdown(TARGET, now)).toEqual({
      status: "upcoming",
      dDay: 1,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 1,
    });
  });

  it("정확히 목표 시각이면 당일", () => {
    expect(getCountdown(TARGET, TARGET)).toEqual({ status: "today" });
  });

  it("KST 자정 경계: UTC 5/14 15:00 은 KST 5/15 00:00 이라 당일", () => {
    const now = Date.parse("2027-05-14T15:00:00Z");
    expect(getCountdown(TARGET, now)).toEqual({ status: "today" });
  });

  it("KST 자정 1ms 전(UTC 5/14 14:59:59.999)은 아직 D-1", () => {
    const now = Date.parse("2027-05-14T14:59:59.999Z");
    expect(getCountdown(TARGET, now).status).toBe("upcoming");
  });

  it("예식 당일 밤 23:59 KST 까지도 당일", () => {
    const now = Date.parse("2027-05-15T23:59:59+09:00");
    expect(getCountdown(TARGET, now)).toEqual({ status: "today" });
  });

  it("KST 다음 날부터 D+1, 이틀 후 D+2", () => {
    expect(
      getCountdown(TARGET, Date.parse("2027-05-16T00:00:00+09:00")),
    ).toEqual({ status: "past", daysSince: 1 });
    expect(
      getCountdown(TARGET, Date.parse("2027-05-17T09:30:00+09:00")),
    ).toEqual({ status: "past", daysSince: 2 });
  });

  it("예식 시각이 오후여도 당일 오전은 today (음수 남은 시간 없음)", () => {
    const afternoon = Date.parse("2027-05-15T13:00:00+09:00");
    const morning = Date.parse("2027-05-15T09:00:00+09:00");
    expect(getCountdown(afternoon, morning)).toEqual({ status: "today" });
  });

  it("D-N 은 KST 달력 기준, days 는 실제 남은 시간 기준", () => {
    // KST 5/14 10:00 → 달력상 하루 전(D-1), 실제 남은 시간은 14시간
    const now = Date.parse("2027-05-14T10:00:00+09:00");
    expect(getCountdown(TARGET, now)).toEqual({
      status: "upcoming",
      dDay: 1,
      days: 0,
      hours: 14,
      minutes: 0,
      seconds: 0,
    });
  });

  it("먼 과거 시점에서도 음수 값이 나오지 않는다", () => {
    const now = Date.parse("2026-09-23T12:34:56+09:00");
    const c = getCountdown(TARGET, now);
    expect(c.status).toBe("upcoming");
    if (c.status !== "upcoming") return;
    for (const v of [c.dDay, c.days, c.hours, c.minutes, c.seconds]) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(c.dDay).toBe(234);
  });
});
