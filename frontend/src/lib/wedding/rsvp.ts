export const RSVP_NAME_MAX = 20;
export const RSVP_MESSAGE_MAX = 200;
export const RSVP_COMPANIONS_MAX = 9;

export type Attendance = "yes" | "no";
export type Side = "groom" | "bride";
export type Meal = "yes" | "no" | "undecided";

/** 폼 입력 그대로의 값. 선택 전은 빈 문자열이다. */
export type RsvpInput = {
  name: string;
  attendance: Attendance | "";
  side: Side | "";
  companions: string;
  meal: Meal | "";
  message: string;
};

export type RsvpField = keyof RsvpInput;
export type RsvpErrors = Partial<Record<RsvpField, string>>;

export type RsvpSubmission = {
  name: string;
  attendance: Attendance;
  side: Side;
  /** 불참이면 null */
  companions: number | null;
  meal: Meal | null;
  message: string;
};

export type RsvpResult =
  | { ok: true; value: RsvpSubmission }
  | { ok: false; errors: RsvpErrors };

/** 화면에 에러를 띄우는 순서 (첫 에러 필드로 포커스를 옮길 때 쓴다) */
export const RSVP_FIELD_ORDER: RsvpField[] = [
  "name",
  "attendance",
  "side",
  "companions",
  "meal",
  "message",
];

export const EMPTY_RSVP: RsvpInput = {
  name: "",
  attendance: "",
  side: "",
  companions: "",
  meal: "",
  message: "",
};

const COMPANIONS_RE = /^\d+$/;

export function validateRsvp(input: RsvpInput): RsvpResult {
  const errors: RsvpErrors = {};

  const name = input.name.trim();
  if (!name) errors.name = "성함을 입력해 주세요.";
  else if (name.length > RSVP_NAME_MAX)
    errors.name = `성함은 ${RSVP_NAME_MAX}자 이내로 입력해 주세요.`;

  if (input.attendance !== "yes" && input.attendance !== "no")
    errors.attendance = "참석 여부를 선택해 주세요.";

  if (input.side !== "groom" && input.side !== "bride")
    errors.side = "신랑 측 / 신부 측을 선택해 주세요.";

  const attending = input.attendance === "yes";
  let companions: number | null = null;
  if (attending) {
    const raw = input.companions.trim();
    const n = Number(raw);
    if (!raw) errors.companions = "함께 오시는 인원을 선택해 주세요.";
    else if (!COMPANIONS_RE.test(raw) || n > RSVP_COMPANIONS_MAX)
      errors.companions = `동행 인원은 0~${RSVP_COMPANIONS_MAX}명 사이로 선택해 주세요.`;
    else companions = n;
  }

  const message = input.message.trim();
  if (message.length > RSVP_MESSAGE_MAX)
    errors.message = `메시지는 ${RSVP_MESSAGE_MAX}자 이내로 남겨 주세요.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      attendance: input.attendance as Attendance,
      side: input.side as Side,
      companions,
      meal: attending && input.meal ? input.meal : null,
      message,
    },
  };
}
