"use client";

import { MotionConfig, useReducedMotion } from "motion/react";
import { useEffect, useReducer, useRef } from "react";

import type { WeddingData } from "@/data/wedding";
import { ceremonyInstant } from "@/lib/wedding/ceremony";

import { introReducer, PHASE_MAX_MS, SAFETY_MARGIN_MS } from "./introMachine";
import EnvelopeScene from "./scene/EnvelopeScene";
import Closing from "./sections/Closing";
import Countdown from "./sections/Countdown";
import Details from "./sections/Details";
import Greeting from "./sections/Greeting";
import OurStory from "./sections/OurStory";
import Rsvp from "./sections/Rsvp";
import { useHydrated } from "./ui/hooks";
import { Toast, useToast } from "./ui/Toast";

export default function WeddingInvitation({ data }: { data: WeddingData }) {
  const [phase, dispatch] = useReducer(introReducer, "sealed");
  const reducedMotion = useReducedMotion() ?? false;
  const hydrated = useHydrated();
  const headingRef = useRef<HTMLHeadingElement>(null);
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

  // 봉투가 열릴 때까지 스크롤을 잠근다. 새로고침 때 브라우저가 복원한 스크롤도 맨 위로 되돌린다.
  // 단, 높이가 낮은 가로 화면에서 장면이 한 화면을 넘으면 봉투까지 내려갈 수 있어야 하므로 잠그지 않는다.
  useEffect(() => {
    if (!introActive) return;
    window.scrollTo(0, 0);
    const stage = document.querySelector(".wd-stage");
    if (stage && stage.getBoundingClientRect().bottom > window.innerHeight) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  }, [introActive]);

  // 누른 봉투 버튼이 비활성화되므로 포커스를 카드 제목으로 옮긴다
  useEffect(() => {
    if (phase !== "done") return;
    headingRef.current?.focus({ preventScroll: true });
  }, [phase]);

  // 서버 HTML 에는 inert 를 넣지 않는다 — JS 가 없을 때 본문이 조작 불가로 남지 않게
  const lockRest = hydrated && introActive;

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative mx-auto w-full max-w-3xl overflow-x-clip bg-wd-ivory wd-unfolded:shadow-wd-card">
        <EnvelopeScene
          data={data}
          phase={phase}
          photos={data.scenePhotos}
          headingRef={headingRef}
          onOpen={() => dispatch({ type: "OPEN", reducedMotion })}
          onPhaseDone={(from) => dispatch({ type: "ADVANCE", from })}
        />
        <div inert={lockRest} aria-hidden={lockRest || undefined}>
          <Greeting data={data} />
          <OurStory items={data.story} />
          <Details data={data} onNotify={notify} />
          <Countdown targetMs={targetMs} />
          <Rsvp />
          <Closing data={data} />
        </div>
      </main>

      <Toast toast={toast} />
    </MotionConfig>
  );
}
