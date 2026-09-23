"use client";

import { AnimatePresence, MotionConfig, useReducedMotion } from "motion/react";
import { useEffect, useReducer, useRef } from "react";

import type { WeddingData } from "@/data/wedding";
import { ceremonyInstant } from "@/lib/wedding/ceremony";

import EnvelopeIntro from "./EnvelopeIntro";
import { introReducer, PHASE_MAX_MS, SAFETY_MARGIN_MS } from "./introMachine";
import Closing from "./sections/Closing";
import Countdown from "./sections/Countdown";
import Details from "./sections/Details";
import Hero, { Greeting } from "./sections/Hero";
import OurStory from "./sections/OurStory";
import Rsvp from "./sections/Rsvp";
import { useHydrated } from "./ui/hooks";
import { Toast, useToast } from "./ui/Toast";

export default function WeddingInvitation({ data }: { data: WeddingData }) {
  const [phase, dispatch] = useReducer(introReducer, "sealed");
  const reducedMotion = useReducedMotion() ?? false;
  const hydrated = useHydrated();
  const heroHeadingRef = useRef<HTMLHeadingElement>(null);
  // 인트로에서 꺼낸 카드가 날아가 겹칠 첫 화면 카드
  const heroCardRef = useRef<HTMLDivElement>(null);
  const { toast, notify } = useToast();

  const introActive = phase !== "done";
  const targetMs = ceremonyInstant(data.ceremony.date, data.ceremony.time);

  // 애니메이션 완료 이벤트가 안 오는 경우(탭 전환, 프레임 드랍)의 안전장치.
  // 완료 이벤트와 둘 다 와도 reducer 가 `from` 으로 걸러 한 번만 진행된다.
  useEffect(() => {
    const max = PHASE_MAX_MS[phase];
    if (max === undefined) return;
    const id = window.setTimeout(
      () => dispatch({ type: "ADVANCE", from: phase }),
      max + SAFETY_MARGIN_MS,
    );
    return () => window.clearTimeout(id);
  }, [phase]);

  // 인트로 동안 뒤 본문이 스크롤되지 않게 잠근다. 새로고침 때 브라우저가 복원한 스크롤도 맨 위로 되돌린다.
  useEffect(() => {
    if (!introActive) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    window.scrollTo(0, 0);
    return () => {
      root.style.overflow = prev;
    };
  }, [introActive]);

  // 봉투를 누른 버튼이 사라지므로 포커스를 히어로 제목으로 옮긴다
  useEffect(() => {
    if (phase !== "done") return;
    window.scrollTo(0, 0);
    heroHeadingRef.current?.focus({ preventScroll: true });
  }, [phase]);

  // 서버 HTML 에는 inert 를 넣지 않는다 — JS 가 없을 때 본문이 조작 불가로 남지 않게
  const lockContent = hydrated && introActive;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {introActive && (
          <EnvelopeIntro
            key="intro"
            phase={phase}
            data={data}
            targetRef={heroCardRef}
            onOpen={() => dispatch({ type: "OPEN", reducedMotion })}
            onPhaseDone={(from) => dispatch({ type: "ADVANCE", from })}
          />
        )}
      </AnimatePresence>

      <main
        inert={lockContent}
        aria-hidden={lockContent || undefined}
        className="relative mx-auto w-full max-w-3xl overflow-x-clip bg-wd-ivory wd-unfolded:shadow-wd-card"
      >
        <Hero data={data} revealed={phase === "done"} cardRef={heroCardRef} headingRef={heroHeadingRef} />
        <Greeting data={data} />
        <OurStory items={data.story} />
        <Details data={data} onNotify={notify} />
        <Countdown targetMs={targetMs} />
        <Rsvp />
        <Closing data={data} />
      </main>

      <Toast toast={toast} />
    </MotionConfig>
  );
}
