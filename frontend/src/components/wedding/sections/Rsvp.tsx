"use client";

import { useId, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import {
  EMPTY_RSVP,
  RSVP_COMPANIONS_MAX,
  RSVP_FIELD_ORDER,
  RSVP_MESSAGE_MAX,
  type RsvpErrors,
  type RsvpField,
  type RsvpInput,
  type RsvpSubmission,
  validateRsvp,
} from "@/lib/wedding/rsvp";

import Reveal from "../ui/Reveal";
import SectionHeading from "../ui/SectionHeading";

type Option = { value: string; label: string };

const ATTENDANCE: Option[] = [
  { value: "yes", label: "참석할게요" },
  { value: "no", label: "마음으로 축하할게요" },
];
const SIDE: Option[] = [
  { value: "groom", label: "신랑 측" },
  { value: "bride", label: "신부 측" },
];
const MEAL: Option[] = [
  { value: "yes", label: "식사할게요" },
  { value: "no", label: "안 할게요" },
  { value: "undecided", label: "미정" },
];

// iOS Safari 는 16px 미만 입력창에 포커스하면 화면을 확대한다 → text-base 고정
const inputClass =
  "block w-full rounded-xl border border-wd-line bg-wd-paper px-4 py-3 text-base text-wd-ink placeholder:text-wd-ink-muted/70 aria-invalid:border-wd-danger";

function ErrorText({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-sm text-wd-danger">
      {message}
    </p>
  );
}

function ChoiceGroup({
  name,
  firstId,
  legend,
  options,
  value,
  error,
  errorId,
  onChange,
}: {
  name: string;
  /** 첫 라디오의 id — 에러 시 여기로 포커스한다 */
  firstId: string;
  legend: string;
  options: Option[];
  value: string;
  error?: string;
  errorId: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-medium text-wd-ink">{legend}</legend>
      <div className={cn("mt-2 grid gap-2", options.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {options.map((o, i) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm break-keep transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-wd-sage-deep",
              value === o.value
                ? "border-wd-sage-deep bg-wd-sage-deep text-wd-paper"
                : cn("bg-wd-paper text-wd-ink hover:bg-wd-sage-soft", error ? "border-wd-danger" : "border-wd-line"),
            )}
          >
            <input
              id={i === 0 ? firstId : undefined}
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
      <ErrorText id={errorId} message={error} />
    </fieldset>
  );
}

function ThankYou({
  value,
  onEdit,
  headingRef,
}: {
  value: RsvpSubmission;
  onEdit: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="wd-paper-texture rounded-[1.5rem] bg-wd-paper px-6 py-10 text-center shadow-wd-card">
      <h3 ref={headingRef} tabIndex={-1} className="text-lg text-wd-ink outline-none">
        {value.name} 님, 소중한 답변 감사합니다
      </h3>
      <p className="mt-3 text-[0.95rem] break-keep text-wd-ink-muted">
        {value.attendance === "yes"
          ? `${value.side === "groom" ? "신랑" : "신부"} 측 · 참석${value.companions ? ` · 동행 ${value.companions}명` : ""}`
          : "마음으로 함께해 주셔서 감사해요."}
      </p>
      <p className="mx-auto mt-6 max-w-[18rem] rounded-xl bg-wd-sage-soft px-4 py-3 text-xs leading-relaxed break-keep text-wd-sage-deep">
        지금은 미리보기라 응답이 저장되지 않아요.
      </p>
      <button
        type="button"
        onClick={onEdit}
        className="mt-6 inline-flex min-h-11 items-center rounded-full border border-wd-sage-deep px-6 text-sm text-wd-sage-deep hover:bg-wd-sage-soft"
      >
        수정하기
      </button>
    </div>
  );
}

export default function Rsvp() {
  const uid = useId();
  const ids = (field: RsvpField) => ({ input: `${uid}-${field}`, error: `${uid}-${field}-error` });

  const [input, setInput] = useState<RsvpInput>(EMPTY_RSVP);
  const [errors, setErrors] = useState<RsvpErrors>({});
  // 첫 제출 전에는 에러를 띄우지 않는다. 한 번 제출한 뒤부터는 입력마다 다시 검증한다
  const [attempted, setAttempted] = useState(false);
  const [submitted, setSubmitted] = useState<RsvpSubmission | null>(null);

  const thanksRef = useRef<HTMLHeadingElement>(null);
  const focusField = (field: RsvpField) => document.getElementById(ids(field).input)?.focus();

  function update(patch: Partial<RsvpInput>) {
    const next = { ...input, ...patch };
    // 불참으로 바꾸면 참석자 전용 값은 버린다 (다시 참석으로 바꿨을 때 예전 값이 남지 않게)
    if (patch.attendance === "no") {
      next.companions = "";
      next.meal = "";
    }
    setInput(next);
    if (attempted) {
      const r = validateRsvp(next);
      setErrors(r.ok ? {} : r.errors);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitted) return;

    const r = validateRsvp(input);
    setAttempted(true);
    if (!r.ok) {
      setErrors(r.errors);
      const first = RSVP_FIELD_ORDER.find((f) => r.errors[f]);
      if (first) focusField(first);
      return;
    }

    // 백엔드가 없는 미리보기 — 네트워크 요청 없이 감사 카드로 바꾼다
    setErrors({});
    setSubmitted(r.value);
    requestAnimationFrame(() => thanksRef.current?.focus());
  }

  function handleEdit() {
    setSubmitted(null);
    requestAnimationFrame(() => focusField("name"));
  }

  const attending = input.attendance === "yes";
  const describedBy = (field: RsvpField) => (errors[field] ? ids(field).error : undefined);

  return (
    <section aria-label="참석 여부" className="@container px-6 py-20 wd-cover:py-14">
      <Reveal>
        <SectionHeading label="참석 여부" script="Kindly RSVP" />
        <p className="mx-auto mt-6 max-w-[24rem] text-center text-[0.95rem] leading-[1.9] break-keep text-wd-ink-muted">
          원활한 준비를 위해 참석 여부를 미리 알려주시면 감사하겠습니다.
        </p>
      </Reveal>

      <Reveal delay={0.1} className="mx-auto mt-10 max-w-[30rem] @[40rem]:max-w-[36rem]">
        {submitted ? (
          <ThankYou value={submitted} onEdit={handleEdit} headingRef={thanksRef} />
        ) : (
          <form
            noValidate
            onSubmit={handleSubmit}
            className="wd-paper-texture grid gap-6 rounded-[1.5rem] bg-wd-paper p-6 shadow-wd-card @[34rem]:p-8"
          >
            <div>
              <label htmlFor={ids("name").input} className="text-sm font-medium text-wd-ink">
                성함
              </label>
              <input
                id={ids("name").input}
                type="text"
                autoComplete="name"
                enterKeyHint="next"
                value={input.name}
                onChange={(e) => update({ name: e.target.value })}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={describedBy("name")}
                className={cn(inputClass, "mt-2")}
                placeholder="홍길동"
              />
              <ErrorText id={ids("name").error} message={errors.name} />
            </div>

            <div className="grid gap-6 @[34rem]:grid-cols-2 @[34rem]:gap-x-8">
              <ChoiceGroup
                name={`${uid}-attendance`}
                firstId={ids("attendance").input}
                legend="참석 여부"
                options={ATTENDANCE}
                value={input.attendance}
                error={errors.attendance}
                errorId={ids("attendance").error}
                onChange={(v) => update({ attendance: v as RsvpInput["attendance"] })}
              />
              <ChoiceGroup
                name={`${uid}-side`}
                firstId={ids("side").input}
                legend="어느 측 하객이신가요"
                options={SIDE}
                value={input.side}
                error={errors.side}
                errorId={ids("side").error}
                onChange={(v) => update({ side: v as RsvpInput["side"] })}
              />
            </div>

            {attending && (
              <div className="grid gap-6 @[34rem]:grid-cols-2 @[34rem]:gap-x-8">
                <div>
                  <label htmlFor={ids("companions").input} className="text-sm font-medium text-wd-ink">
                    함께 오시는 분 <span className="font-normal text-wd-ink-muted">(본인 제외)</span>
                  </label>
                  <select
                    id={ids("companions").input}
                    value={input.companions}
                    onChange={(e) => update({ companions: e.target.value })}
                    aria-invalid={errors.companions ? true : undefined}
                    aria-describedby={describedBy("companions")}
                    className={cn(inputClass, "mt-2 appearance-none")}
                  >
                    <option value="">선택해 주세요</option>
                    {Array.from({ length: RSVP_COMPANIONS_MAX + 1 }, (_, n) => (
                      <option key={n} value={String(n)}>
                        {n === 0 ? "없어요" : `${n}명`}
                      </option>
                    ))}
                  </select>
                  <ErrorText id={ids("companions").error} message={errors.companions} />
                </div>

                <ChoiceGroup
                  name={`${uid}-meal`}
                  firstId={ids("meal").input}
                  legend="식사 여부 (선택)"
                  options={MEAL}
                  value={input.meal}
                  error={errors.meal}
                  errorId={ids("meal").error}
                  onChange={(v) => update({ meal: v as RsvpInput["meal"] })}
                />
              </div>
            )}

            <div>
              <label htmlFor={ids("message").input} className="text-sm font-medium text-wd-ink">
                전하고 싶은 말 <span className="font-normal text-wd-ink-muted">(선택)</span>
              </label>
              <textarea
                id={ids("message").input}
                rows={3}
                maxLength={RSVP_MESSAGE_MAX}
                value={input.message}
                onChange={(e) => update({ message: e.target.value })}
                aria-invalid={errors.message ? true : undefined}
                aria-describedby={cn(`${ids("message").input}-count`, describedBy("message"))}
                className={cn(inputClass, "mt-2 resize-none")}
              />
              <p id={`${ids("message").input}-count`} className="mt-1 text-right text-xs text-wd-ink-muted tabular-nums">
                {input.message.length} / {RSVP_MESSAGE_MAX}
              </p>
              <ErrorText id={ids("message").error} message={errors.message} />
            </div>

            <button
              type="submit"
              className="min-h-12 rounded-full bg-wd-sage-deep px-6 text-base tracking-[0.1em] text-wd-paper transition-opacity hover:opacity-90"
            >
              답변 보내기
            </button>
          </form>
        )}
      </Reveal>
    </section>
  );
}
