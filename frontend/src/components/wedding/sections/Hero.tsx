"use client";

import { motion } from "motion/react";

import type { Person, WeddingData } from "@/data/wedding";
import {
  formatTimeKo,
  pad2,
  parseCeremonyDate,
  WEEKDAYS_EN,
} from "@/lib/wedding/ceremony";

import { CallaLily, Sprig } from "../ui/Ornaments";
import PhotoFrame from "../ui/PhotoFrame";
import Reveal from "../ui/Reveal";

const ease = [0.22, 1, 0.36, 1] as const;

/** 인트로가 끝난 뒤(revealed)부터 순서대로 떠오른다. */
function Rise({
  revealed,
  delay,
  className,
  children,
}: {
  revealed: boolean;
  delay: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className={`wd-reveal ${className ?? ""}`}
      initial={{ opacity: 0, y: 18 }}
      animate={revealed ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.8, delay: 0.25 + delay, ease }}
    >
      {children}
    </motion.div>
  );
}

export default function Hero({
  data,
  revealed,
  headingRef,
}: {
  data: WeddingData;
  revealed: boolean;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const date = parseCeremonyDate(data.ceremony.date);
  const { venue } = data;

  return (
    <section
      aria-labelledby="wd-hero-title"
      className="@container wd-screen relative flex flex-col items-center justify-center overflow-hidden px-6
        pt-[max(4rem,env(safe-area-inset-top))] pb-16 text-center
        wd-cover:pt-[max(2.5rem,env(safe-area-inset-top))] wd-cover:pb-10"
    >
      <Rise revealed={revealed} delay={0}>
        <p lang="en" className="font-wd-display text-[0.8rem] font-medium tracking-[0.3em] text-wd-sage-deep">
          JOIN US FOR THE WEDDING OF
        </p>
      </Rise>

      <Rise revealed={revealed} delay={0.15} className="relative mt-6 w-full max-w-[21rem] @[34rem]:max-w-[25rem]">
        {/* 아치형 카드 — 안쪽에 한 줄 더 그어 인쇄물 느낌을 낸다 */}
        <div className="wd-paper-texture relative rounded-t-full rounded-b-[1.75rem] bg-wd-paper px-8 pt-[38%] pb-10 shadow-wd-card">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-2.5 rounded-t-full rounded-b-[1.4rem] border border-wd-line"
          />

          <h1 id="wd-hero-title" ref={headingRef} tabIndex={-1} className="relative outline-none">
            <span lang="en" className="wd-name block font-wd-script leading-[1.05] text-wd-ink">
              {data.groom.nameEn}
            </span>
            <span lang="en" className="block font-wd-script text-3xl leading-none text-wd-sage-deep">
              &amp;
            </span>
            <span lang="en" className="wd-name block font-wd-script leading-[1.05] text-wd-ink">
              {data.bride.nameEn}
            </span>
            <span className="mt-4 block text-base tracking-[0.2em] break-keep text-wd-ink">
              {data.groom.name} <span className="text-wd-sage-deep">·</span> {data.bride.name}
            </span>
          </h1>

          <Sprig className="relative mx-auto mt-5 w-20 text-wd-sage" />

          <p className="relative mt-5 font-wd-display text-lg tracking-[0.18em] text-wd-ink">
            {date.year}. {pad2(date.month)}. {pad2(date.day)}
            <span lang="en" className="mt-1 block text-xs tracking-[0.35em] text-wd-ink-muted">
              {WEEKDAYS_EN[date.weekday]}
              {data.ceremony.time && ` · ${formatTimeKo(data.ceremony.time)}`}
            </span>
          </p>

          <p className="relative mt-4 text-sm leading-relaxed break-keep text-wd-ink-muted">
            {venue.name}
            {venue.hall && <span className="block">{venue.hall}</span>}
          </p>
        </div>

        <CallaLily className="absolute -top-[4%] -right-[6%] w-[22%] -rotate-[14deg]" />
      </Rise>

      <Rise
        revealed={revealed}
        delay={0.35}
        className="relative -mt-10 mr-auto ml-[4%] w-[42%] max-w-[10rem] @[34rem]:ml-[12%]"
      >
        <PhotoFrame photo={data.heroPhoto} tilt={-5} sizes="160px" />
      </Rise>
    </section>
  );
}

function ParentsLine({ person }: { person: Person }) {
  const { father, mother } = person.parents ?? {};
  const parents = [father, mother].filter(Boolean).join(" · ");
  return (
    <p className="break-keep">
      {parents && (
        <>
          <span className="text-wd-ink">{parents}</span>
          <span className="text-wd-ink-muted">의 {person.relation} </span>
        </>
      )}
      <span className="font-medium text-wd-ink">{person.name}</span>
    </p>
  );
}

export function Greeting({ data }: { data: WeddingData }) {
  return (
    <section aria-labelledby="wd-greeting-title" className="@container px-6 py-20 text-center wd-cover:py-14">
      <Reveal>
        <h2 id="wd-greeting-title" className="text-xs font-medium tracking-[0.35em] text-wd-sage-deep">
          초대합니다
        </h2>
        <div className="mx-auto mt-8 max-w-[26rem] text-[0.95rem] leading-[2.1] break-keep text-wd-ink">
          {data.greeting.map((line, i) =>
            line ? <p key={i}>{line}</p> : <p key={i} aria-hidden="true" className="h-4" />,
          )}
        </div>
      </Reveal>

      <Reveal delay={0.1} className="mx-auto mt-12 max-w-[26rem]">
        <Sprig className="mx-auto w-16 text-wd-sage" />
        <div className="mt-8 grid gap-3 text-[0.95rem] @[30rem]:grid-cols-2 @[30rem]:gap-x-10">
          <ParentsLine person={data.groom} />
          <ParentsLine person={data.bride} />
        </div>
      </Reveal>
    </section>
  );
}
