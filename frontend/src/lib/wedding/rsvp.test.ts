import { describe, expect, it } from "vitest";

import { EMPTY_RSVP, type RsvpInput, validateRsvp } from "./rsvp";

const valid: RsvpInput = {
  name: "홍길동",
  attendance: "yes",
  side: "groom",
  companions: "1",
  meal: "yes",
  message: "축하해요",
};

function errorsOf(input: RsvpInput) {
  const r = validateRsvp(input);
  return r.ok ? {} : r.errors;
}

describe("validateRsvp", () => {
  it("정상 입력은 정리된 값을 돌려준다", () => {
    expect(validateRsvp({ ...valid, name: "  홍길동 " })).toEqual({
      ok: true,
      value: {
        name: "홍길동",
        attendance: "yes",
        side: "groom",
        companions: 1,
        meal: "yes",
        message: "축하해요",
      },
    });
  });

  it("빈 폼은 필수 항목 에러를 모두 낸다", () => {
    expect(Object.keys(errorsOf(EMPTY_RSVP)).sort()).toEqual(
      ["attendance", "name", "side"].sort(),
    );
  });

  it("공백만 있는 이름은 거부", () => {
    expect(errorsOf({ ...valid, name: "   " }).name).toBeDefined();
  });

  it("이름 20자는 통과, 21자는 거부", () => {
    expect(errorsOf({ ...valid, name: "가".repeat(20) }).name).toBeUndefined();
    expect(errorsOf({ ...valid, name: "가".repeat(21) }).name).toBeDefined();
  });

  it("참석인데 동행 인원이 비어 있으면 거부", () => {
    expect(errorsOf({ ...valid, companions: "" }).companions).toBeDefined();
  });

  it("동행 인원은 0~9 정수만", () => {
    expect(errorsOf({ ...valid, companions: "0" }).companions).toBeUndefined();
    expect(errorsOf({ ...valid, companions: "9" }).companions).toBeUndefined();
    expect(errorsOf({ ...valid, companions: "10" }).companions).toBeDefined();
    expect(errorsOf({ ...valid, companions: "-1" }).companions).toBeDefined();
    expect(errorsOf({ ...valid, companions: "1.5" }).companions).toBeDefined();
    expect(errorsOf({ ...valid, companions: "abc" }).companions).toBeDefined();
  });

  it("불참이면 동행 인원·식사를 검증하지 않고 버린다", () => {
    const r = validateRsvp({
      ...valid,
      attendance: "no",
      companions: "abc",
      meal: "yes",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.companions).toBeNull();
    expect(r.value.meal).toBeNull();
  });

  it("식사 여부는 선택 사항", () => {
    const r = validateRsvp({ ...valid, meal: "" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.meal).toBeNull();
  });

  it("메시지 200자는 통과, 201자는 거부 (앞뒤 공백은 세지 않음)", () => {
    expect(
      errorsOf({ ...valid, message: ` ${"가".repeat(200)} ` }).message,
    ).toBeUndefined();
    expect(
      errorsOf({ ...valid, message: "가".repeat(201) }).message,
    ).toBeDefined();
  });
});
