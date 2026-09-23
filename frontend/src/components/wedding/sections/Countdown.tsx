"use client";

import { getCountdown } from "@/lib/wedding/countdown";
import { pad2 } from "@/lib/wedding/ceremony";

import { useNowSeconds } from "../ui/hooks";
import Reveal from "../ui/Reveal";
import SectionHeading from "../ui/SectionHeading";

const UNITS = [
  { key: "days", label: "DAYS" },
  { key: "hours", label: "HOURS" },
  { key: "minutes", label: "MINUTES" },
  { key: "seconds", label: "SECONDS" },
] as const;

export default function Countdown({ targetMs }: { targetMs: number }) {
  const now = useNowSeconds();
  // 서버/하이드레이션 중에는 now 가 없다 — 칸만 잡아 두고 값은 비운다
  const c = now === null ? null : getCountdown(targetMs, now);

  let summary: string;
  let badge: string;
  if (c === null) {
    summary = "예식까지 남은 시간을 계산하고 있어요.";
    badge = "D-";
  } else if (c.status === "upcoming") {
    summary = `예식까지 ${c.dDay}일 남았어요.`;
    badge = `D-${c.dDay}`;
  } else if (c.status === "today") {
    summary = "오늘, 저희 결혼합니다.";
    badge = "D-DAY";
  } else {
    summary = "함께해 주셔서 감사합니다.";
    badge = `D+${c.daysSince}`;
  }

  return (
    <section aria-label="카운트다운" className="@container bg-wd-sage-soft/60 px-6 py-20 wd-cover:py-14">
      <Reveal>
        <SectionHeading label="그날까지" script="The countdown is on" />
      </Reveal>

      {/* role=timer 는 기본적으로 낭독하지 않는다. 매초 바뀌는 숫자는 숨기고 요약만 읽힌다 */}
      <Reveal delay={0.1} className="mx-auto mt-10 max-w-[30rem] text-center">
        <div role="timer" aria-label={summary}>
          <p aria-hidden="true" className="font-wd-display text-3xl tracking-[0.2em] text-wd-sage-deep">
            {badge}
          </p>

          {(c === null || c.status === "upcoming") && (
            <ul aria-hidden="true" className="mt-6 grid grid-cols-4 gap-2 @[26rem]:gap-4">
              {UNITS.map(({ key, label }) => (
                <li key={key} className="rounded-2xl bg-wd-paper px-1 py-4 shadow-wd-card">
                  <span className="block font-wd-display text-[clamp(1.6rem,8cqi,2.5rem)] leading-none text-wd-ink tabular-nums">
                    {c === null ? "--" : pad2(c[key])}
                  </span>
                  <span lang="en" className="mt-2 block text-[0.6rem] tracking-[0.2em] text-wd-ink-muted">
                    {label}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p aria-hidden="true" className="mt-6 text-[0.95rem] break-keep text-wd-ink">
            {summary}
          </p>
        </div>
      </Reveal>
    </section>
  );
}
