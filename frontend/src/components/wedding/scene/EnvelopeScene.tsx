"use client";

import { motion } from "motion/react";
import { useId } from "react";

import type { WeddingData } from "@/data/wedding";
import { cn } from "@/lib/cn";

import type { IntroPhase } from "../introMachine";
import PhotoFrame from "../ui/PhotoFrame";
import { BouquetBack, BouquetFront, BouquetMid } from "./Bouquet";
import { Calla, FloraDefs, floraIds } from "./flora";
import {
  CARD,
  CARD_CLIP,
  CARD_TUCK_PCT,
  ENV,
  LP,
  PHOTOS,
  place,
  STAGE_H,
  STICKER_W,
  STICKER_Y,
} from "./geometry";
import SceneCard from "./SceneCard";
import SceneLp from "./SceneLp";

const EASE_PAPER = [0.65, 0, 0.35, 1] as const;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/*
  첫 화면 = 열린 봉투 한 장면 (Studio Gwyn "Envelope 06" 구성).
  봉투는 움직이지 않는다. 봉인 상태의 문구 자리에 열리면 카드·부케가 올라온다.

    opening  : 문구·모노그램이 사라지고 덮개가 넘어간다       (≤ 1.1s)
    rising   : 카드가 봉투에서 올라온다                         (0.9s ≤ 1.0s)
    blooming : 부케가 피고, 사진이 카드 뒤에서 나오고, LP 가 놓인다 (마지막 LP 1.5s ≤ 1.8s)
*/

/** 펠트 같은 수제 봉투 종이 — 가장자리는 노이즈로 흔들어 손으로 뜯은 듯(데클), 면은 조명 필터로 도톰한 결 */
function FeltDefs({ id }: { id: string }) {
  return (
    <svg aria-hidden="true" className="absolute size-0 overflow-hidden">
      <defs>
        <filter id={id} x="-4%" y="-4%" width="108%" height="108%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="3" seed="4" result="edge" />
          <feDisplacementMap in="SourceGraphic" in2="edge" scale="1.1" xChannelSelector="R" yChannelSelector="G" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="3.4" numOctaves="2" seed="11" result="fuzz" />
          <feDiffuseLighting in="fuzz" surfaceScale="0.28" lightingColor="#ffffff" result="light">
            <feDistantLight azimuth="225" elevation="68" />
          </feDiffuseLighting>
          <feComposite in="light" in2="rough" operator="arithmetic" k1="1.08" k2="0" k3="0" k4="0" result="felt" />
          <feComposite in="felt" in2="rough" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}

/** 봉투 가운데 붙은 흰 원형 스티커 — 종이 결, 안쪽 괘선, 모노그램, 살짝 도는 광택 */
function SealSticker({ monogram }: { monogram: string }) {
  return (
    <div className="wd-paper-texture relative aspect-square w-full rounded-full bg-wd-paper shadow-[0_1px_1px_rgb(59_47_34/0.18),0_3px_6px_-1px_rgb(59_47_34/0.28)] ring-1 ring-wd-line/70">
      <svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0 h-full w-full">
        <circle cx="50" cy="50" r="41" fill="none" className="stroke-wd-sage-light" strokeWidth="1.2" />
        <circle cx="50" cy="50" r="37.5" fill="none" className="stroke-wd-line" strokeWidth="0.6" />
        <text
          x="50"
          y="60"
          textAnchor="middle"
          fontSize="30"
          className="fill-wd-sage-deep"
          style={{ fontFamily: "var(--wd-font-script), cursive" }}
        >
          {monogram}
        </text>
      </svg>
      {/* 코팅된 스티커의 광택 */}
      <span className="pointer-events-none absolute inset-[6%] rounded-full bg-[radial-gradient(circle_at_32%_26%,rgb(255_255_255/0.75),transparent_42%)]" />
    </div>
  );
}

/** 봉인 상태에서 봉투 오른쪽에 놓인 칼라 두 송이 */
function SealedCallas() {
  const f = floraIds(useId());
  return (
    <svg viewBox="0 0 30 50" aria-hidden="true" className="h-auto w-full overflow-visible">
      <FloraDefs f={f} />
      <Calla f={f} x1={2} y1={49} x2={22} y2={14} s={6.5} rot={30} bend={4} />
      <Calla f={f} x1={6} y1={50} x2={21} y2={33} s={5.5} rot={62} bend={-2} />
    </svg>
  );
}

export default function EnvelopeScene({
  data,
  phase,
  photos,
  onOpen,
  onPhaseDone,
  headingRef,
}: {
  data: WeddingData;
  phase: IntroPhase;
  photos: WeddingData["scenePhotos"];
  onOpen: () => void;
  onPhaseDone: (from: IntroPhase) => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const felt = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-felt`;
  const sealed = phase === "sealed";
  const flapClosed = phase === "sealed" || phase === "opening";
  const cardOut = phase === "rising" || phase === "blooming" || phase === "done";
  const bloom = phase === "blooming" || phase === "done";
  const done = phase === "done";
  const feltFill = { filter: `url(#${felt})` };

  return (
    <section
      aria-labelledby="wd-hero-title"
      className="wd-screen relative flex flex-col items-center justify-center overflow-hidden px-4
        pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="wd-stage @container relative aspect-[2/3]">
        <FeltDefs id={felt} />

        {/* 봉인 상태 문구 — 열리면 이 자리에 카드와 부케가 올라온다 */}
        <motion.div
          className="wd-sealed-only pointer-events-none absolute inset-x-0 top-[10%] z-[1] text-center"
          initial={false}
          animate={sealed ? { opacity: 1, y: 0 } : { opacity: 0, y: -12 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <p lang="en" className="font-wd-display text-[clamp(0.6rem,3.2cqw,0.85rem)] font-medium tracking-[0.3em] text-wd-ink">
            YOU HAVE MAIL FROM
          </p>
          <p lang="en" className="mt-[2cqw] font-wd-script text-[clamp(2rem,13cqw,4rem)] leading-[1.05] text-wd-ink">
            {data.groom.nameEn}
            <br />
            <span className="text-[0.8em]">&amp;</span> {data.bride.nameEn}
          </p>
          <p className="mt-[3cqw] text-[clamp(0.75rem,3.7cqw,1rem)] tracking-[0.2em] text-wd-ink-muted">
            {data.groom.name} · {data.bride.name}
          </p>
        </motion.div>

        {/* z1 봉투 뒤판 */}
        <div className="pointer-events-none absolute z-[1] aspect-[1.45]" style={place(ENV)}>
          <svg viewBox="0 0 100 69" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_6px_10px_rgb(59_47_34/0.22)]">
            <rect x="0.6" y="0.6" width="98.8" height="67.8" rx="1.4" className="fill-wd-sage-inner" style={feltFill} />
          </svg>
        </div>

        {/* 덮개 — 닫혀 있을 땐 맨 위, 넘어간 뒤에는 사진·꽃·카드보다 뒤 (z-index 는 className 으로: motion style 의 zIndex 는 갱신되지 않는다) */}
        <div
          className={cn("pointer-events-none absolute aspect-[1.45]", flapClosed ? "z-30" : "z-[2]")}
          style={place(ENV)}
        >
          <motion.div
            className="absolute inset-x-0 top-0 h-[61%] drop-shadow-[0_2px_2px_rgb(0_0_0/0.16)]"
            style={{ transformOrigin: "50% 0%", transformPerspective: 900 }}
            initial={false}
            // 템플릿처럼 넘어간 덮개는 봉투 뒤로 접혀 들어간 듯 사라진다 (카드 옆에 삼각형이 남지 않게)
            animate={{ rotateX: sealed ? 0 : 180, opacity: cardOut ? 0 : 1 }}
            transition={{
              rotateX: { duration: 0.65, delay: sealed ? 0 : 0.3, ease: EASE_PAPER },
              opacity: { duration: 0.45, ease: "easeOut" },
            }}
            onAnimationComplete={() => onPhaseDone("opening")}
          >
            <svg viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
              <path d="M0.8 0.8 H99.2 L55 38 Q50 41.8 45 38 Z" className="fill-wd-sage" style={feltFill} />
            </svg>
          </motion.div>
        </div>

        {/*
          봉투 중앙의 흰 스티커 — 덮개 끝과 앞주머니에 걸쳐 붙어 있으므로 덮개와 함께 돌지 않는다.
          열리기 시작하면 덮개가 넘어가기 전에(덮개는 0.3s 뒤 출발) 살짝 들리며 떨어진다.
        */}
        <motion.div
          className="wd-sealed-only pointer-events-none absolute z-[31] -translate-x-1/2 -translate-y-1/2"
          style={{ left: "50%", top: `${(STICKER_Y / STAGE_H) * 100}%`, width: `${STICKER_W}%` }}
          initial={false}
          animate={sealed ? { opacity: 1, scale: 1, rotate: 0, y: 0 } : { opacity: 0, scale: 1.08, rotate: -10, y: -10 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <SealSticker monogram={data.monogram} />
        </motion.div>

        {/* z3 폴라로이드 — 카드 뒤에서 왼쪽으로 빠져나온다 */}
        {PHOTOS.map((p, i) => (
          <motion.div
            key={i}
            className="wd-reveal pointer-events-none absolute z-[3]"
            style={place(p)}
            initial={{ opacity: 0, x: "45%", rotate: 0 }}
            animate={bloom ? { opacity: 1, x: "0%", rotate: p.rot } : { opacity: 0, x: "45%", rotate: 0 }}
            transition={{ duration: 0.8, delay: bloom ? 0.25 + i * 0.15 : 0, ease: EASE_OUT }}
          >
            <PhotoFrame photo={photos?.[i]} sizes="(min-width: 560px) 150px, 35vw" />
          </motion.div>
        ))}

        {/* z4 카드 뒤 부케 */}
        <BouquetBack show={bloom} className="z-[4]" />

        {/* z5 카드 — 봉투 아랫변 밖으로는 잘린다 */}
        <div className="pointer-events-none absolute inset-0 z-[5]" style={{ clipPath: CARD_CLIP }}>
          <motion.div
            className="wd-reveal absolute"
            style={place(CARD)}
            initial={{ y: `${CARD_TUCK_PCT}%` }}
            animate={{ y: cardOut ? "0%" : `${CARD_TUCK_PCT}%` }}
            transition={{ duration: 0.9, ease: EASE_PAPER }}
            onAnimationComplete={() => {
              if (phase === "rising") onPhaseDone("rising");
            }}
          >
            <SceneCard data={data} headingRef={headingRef} />
          </motion.div>
        </div>

        {/* z6 카드 앞 · 앞주머니 뒤 */}
        <BouquetMid show={bloom} className="z-[6]" />

        {/* z7 앞주머니 — 누르는 곳 */}
        <div className="absolute z-[7] aspect-[1.45]" style={place(ENV)}>
          <button
            type="button"
            onClick={onOpen}
            disabled={!sealed}
            aria-label="청첩장 열기"
            className="group absolute inset-0 cursor-pointer rounded-[3px] disabled:cursor-default"
          >
            <svg viewBox="0 0 100 69" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_-1px_2px_rgb(0_0_0/0.1)]">
              <path d="M0.6 0.8 L46 37 Q50 40 54 37 L99.4 0.8 V68.4 H0.6 Z" className="fill-wd-sage" style={feltFill} />
              <path d="M0.6 68.4 L41 39 M99.4 68.4 L59 39" className="stroke-wd-sage-inner" strokeWidth="0.35" opacity="0.45" fill="none" vectorEffect="non-scaling-stroke" />
            </svg>
          </button>
        </div>

        {/* 봉인 상태의 칼라 — 꽃이 피면 부케 쪽으로 사라진다 */}
        <motion.div
          className="wd-sealed-only pointer-events-none absolute z-[8]"
          style={place({ x: 78, y: 96, w: 23 })}
          initial={false}
          animate={{ opacity: bloom ? 0 : 1 }}
          transition={{ duration: 0.4 }}
        >
          <SealedCallas />
        </motion.div>

        {/* z8 맨 앞 꽃 */}
        <BouquetFront show={bloom} className="z-[8]" />

        {/* z9 LP — 인트로가 끝나야 누를 수 있다 */}
        <motion.div
          className={cn("wd-reveal absolute z-[9]", !done && "pointer-events-none")}
          style={place(LP)}
          initial={{ opacity: 0, scale: 0.6, rotate: -40 }}
          animate={bloom ? { opacity: 1, scale: 1, rotate: 0 } : { opacity: 0, scale: 0.6, rotate: -40 }}
          transition={{ duration: 0.6, delay: bloom ? 0.9 : 0, ease: EASE_OUT }}
          onAnimationComplete={() => {
            if (phase === "blooming") onPhaseDone("blooming");
          }}
        >
          <SceneLp monogram={data.monogram} />
        </motion.div>
      </div>
    </section>
  );
}
