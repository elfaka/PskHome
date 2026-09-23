"use client";

import { motion } from "motion/react";

import type { Person, WeddingData } from "@/data/wedding";

import InvitationCard from "../InvitationCard";
import LpPlayer from "../ui/LpPlayer";
import { CallaLily, Sprig } from "../ui/Ornaments";
import Reveal from "../ui/Reveal";

const ease = [0.22, 1, 0.36, 1] as const;

/** 인트로가 끝난 뒤(revealed)부터 떠오른다. */
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
      transition={{ duration: 0.8, delay: 0.15 + delay, ease }}
    >
      {children}
    </motion.div>
  );
}

/**
 * 첫 화면 — 봉투에서 꺼낸 카드 + LP.
 * 카드는 처음부터 제자리에 그대로 있다(애니메이션 없음). 인트로의 사본 카드가 여기로 날아와 겹친 뒤 사라진다.
 * 좁은 화면: 카드 아래 LP. 컨테이너 34rem 이상(펼친 폴더블·데스크톱): 카드 | LP 2단, 거터가 화면 중앙.
 */
export default function Hero({
  data,
  revealed,
  cardRef,
  headingRef,
}: {
  data: WeddingData;
  revealed: boolean;
  cardRef: React.Ref<HTMLDivElement>;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <section
      aria-labelledby="wd-hero-title"
      className="@container wd-screen relative flex flex-col items-center justify-center overflow-hidden px-6
        pt-[max(2.5rem,env(safe-area-inset-top))] pb-12
        wd-cover:pt-[max(1.5rem,env(safe-area-inset-top))] wd-cover:pb-8"
    >
      <div className="grid w-full max-w-[44rem] justify-items-center gap-9 wd-cover:gap-5 @[34rem]:grid-cols-2 @[34rem]:items-center @[34rem]:gap-x-14">
        <div className="relative z-10 w-full max-w-[19.5rem] @[34rem]:justify-self-end">
          <InvitationCard variant="page" data={data} cardRef={cardRef} headingRef={headingRef} />
          <Rise revealed={revealed} delay={0.2} className="pointer-events-none absolute -top-[5%] -right-[8%] w-[19%]">
            <CallaLily className="w-full -rotate-[14deg]" />
          </Rise>
        </div>

        <Rise
          revealed={revealed}
          delay={0.4}
          className="w-[8.5rem] wd-cover:w-[6rem] @[34rem]:w-[12rem] @[34rem]:justify-self-start"
        >
          <LpPlayer data={data} />
        </Rise>
      </div>
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
