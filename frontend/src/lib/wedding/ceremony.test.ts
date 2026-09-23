import { describe, expect, it } from "vitest";

import {
  ceremonyInstant,
  formatTimeKo,
  monthGrid,
  parseCeremonyDate,
} from "./ceremony";

describe("parseCeremonyDate", () => {
  it("2027-05-15 는 토요일", () => {
    expect(parseCeremonyDate("2027-05-15")).toEqual({
      year: 2027,
      month: 5,
      day: 15,
      weekday: 6,
    });
  });

  it("형식이 틀리면 에러", () => {
    expect(() => parseCeremonyDate("2027-5-15")).toThrow();
    expect(() => parseCeremonyDate("2027/05/15")).toThrow();
  });

  it("존재하지 않는 날짜는 에러 (Date 의 월 넘김을 막는다)", () => {
    expect(() => parseCeremonyDate("2027-02-30")).toThrow();
    expect(() => parseCeremonyDate("2027-13-01")).toThrow();
  });
});

describe("ceremonyInstant", () => {
  it("시각이 없으면 KST 00:00", () => {
    expect(ceremonyInstant("2027-05-15")).toBe(
      Date.parse("2027-05-14T15:00:00Z"),
    );
  });

  it("시각이 있으면 KST 그 시각", () => {
    expect(ceremonyInstant("2027-05-15", "13:30")).toBe(
      Date.parse("2027-05-15T04:30:00Z"),
    );
  });

  it("시각 형식이 틀리면 에러", () => {
    expect(() => ceremonyInstant("2027-05-15", "25:00")).toThrow();
    expect(() => ceremonyInstant("2027-05-15", "1:30")).toThrow();
  });
});

describe("formatTimeKo", () => {
  it.each([
    ["00:00", "오전 12시"],
    ["11:05", "오전 11시 5분"],
    ["12:00", "오후 12시"],
    ["13:30", "오후 1시 30분"],
  ])("%s → %s", (input, expected) => {
    expect(formatTimeKo(input)).toBe(expected);
  });
});

describe("monthGrid", () => {
  it("2027년 5월은 토요일 시작, 31일, 6주", () => {
    const weeks = monthGrid(2027, 5);
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, 1]);
    expect(weeks[2][6]).toBe(15);
    expect(weeks.flat().filter((d) => d !== null)).toHaveLength(31);
    weeks.forEach((w) => expect(w).toHaveLength(7));
  });

  it("윤년 2월", () => {
    const days = monthGrid(2028, 2).flat().filter((d) => d !== null);
    expect(days).toHaveLength(29);
  });
});
