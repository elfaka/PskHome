"use client";

import { motion } from "motion/react";
import { useId } from "react";

import type { WeddingData } from "@/data/wedding";
import { cn } from "@/lib/cn";

import type { IntroPhase } from "../introMachine";
import PhotoFrame from "../ui/PhotoFrame";
import { BouquetBack, BouquetFront, BouquetMid } from "./Bouquet";
import { useMusicBox } from "../ui/useMusicBox";
import { FloraDefs, floraIds, PhotoCalla } from "./flora";
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

/*
  봉투 조각 윤곽 (봉투 viewBox 100 × 69, 덮개는 100 × 42).
  앞주머니는 한 장이 아니라 양옆 날개 위에 아랫날개가 겹친 세 면이라, 면마다 빛을 다르게 받아 입체로 보인다.
*/
const FLAP = "M0.3 0.3 H99.7 L55 38 Q50 41.8 45 38 Z";
const POCKET = "M0.3 0.6 L46 37 Q50 40 54 37 L99.7 0.6 V68.7 H0.3 Z";
const SIDE_L = "M0.3 0.6 L46 37 Q48 38.5 50 38.5 V62 L0.3 68.7 Z";
const SIDE_R = "M99.7 0.6 L54 37 Q52 38.5 50 38.5 V62 L99.7 68.7 Z";
const BOTTOM = "M0.3 68.7 L42.5 41.4 Q50 46.2 57.5 41.4 L99.7 68.7 Z";

/**
 * 벨벳 봉투 재질 — 필터 한 벌을 봉투 조각마다 따로 건다.
 *   잔털: 아주 고운 노이즈로 명암을 조금씩 흔든다
 *   광택: 낮은 주파수 노이즈를 높낮이 삼은 반사광 — 결이 눌린 벨벳의 은은한 얼룩 광택
 *   테 빛: 가장자리 안쪽 띠가 밝다 — 결이 눕는 모서리에서 빛을 받는 벨벳의 특징.
 *          조각마다 생기므로 날개가 겹친 접힘선도 도톰하게 빛난다.
 * 면 음영(그라디언트)은 왼쪽 위에서 오는 빛 기준이다.
 */
function VelvetDefs({ id }: { id: string }) {
  return (
    <svg aria-hidden="true" className="absolute size-0 overflow-hidden">
      <defs>
        <filter id={`${id}-velvet`} x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="2.4" numOctaves="2" seed="5" result="pile" />
          <feColorMatrix
            in="pile"
            type="matrix"
            values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1"
            result="pileGray"
          />
          <feComposite in="SourceGraphic" in2="pileGray" operator="arithmetic" k1="0.34" k2="0.84" result="napped" />
          <feTurbulence type="fractalNoise" baseFrequency="0.04 0.06" numOctaves="2" seed="9" result="crush" />
          <feGaussianBlur in="crush" stdDeviation="1.4" result="crushSoft" />
          <feSpecularLighting in="crushSoft" surfaceScale="5" specularConstant="0.5" specularExponent="7" lightingColor="#ffffff" result="sheen">
            <feDistantLight azimuth="235" elevation="40" />
          </feSpecularLighting>
          <feComposite in="sheen" in2="napped" operator="arithmetic" k2="0.28" k3="1" result="glossy" />
          <feMorphology in="SourceAlpha" operator="erode" radius="0.8" result="core" />
          <feGaussianBlur in="core" stdDeviation="1.2" result="coreSoft" />
          <feComposite in="SourceAlpha" in2="coreSoft" operator="out" result="rimMask" />
          <feFlood floodColor="#eef2e2" floodOpacity="0.3" />
          <feComposite in2="rimMask" operator="in" result="rim" />
          <feMerge result="lit">
            <feMergeNode in="glossy" />
            <feMergeNode in="rim" />
          </feMerge>
          <feComposite in="lit" in2="SourceAlpha" operator="in" />
        </filter>
        {/* 아랫날개가 양옆 날개 위에 드리우는 접촉 그림자 */}
        <filter id={`${id}-ao`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1" />
        </filter>
        <clipPath id={`${id}-pocket`}>
          <path d={POCKET} />
        </clipPath>
        {/* 왼쪽 날개: 빛을 마주 봐 밝다 */}
        <linearGradient id={`${id}-side-l`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.13" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* 오른쪽 날개: 빛을 등져 어둡다 */}
        <linearGradient id={`${id}-side-r`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000000" stopOpacity="0.03" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.16" />
        </linearGradient>
        {/* 아랫날개: 윗변 접힘은 밝고 아래로 갈수록 가라앉는다 */}
        <linearGradient id={`${id}-bottom`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.1" />
        </linearGradient>
        {/* 덮개: 경첩 쪽이 밝고 끝으로 갈수록 어둡다 */}
        <linearGradient id={`${id}-flap`} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.16" />
        </linearGradient>
        {/* 봉투 안쪽: 깊을수록 어둡다 */}
        <linearGradient id={`${id}-inside`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000000" stopOpacity="0.04" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.32" />
        </linearGradient>
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

/** 봉인 상태에서 봉투 오른쪽 모서리에 비스듬히 놓인 칼라 두 송이 (사진) */
function SealedCallas() {
  const f = floraIds(useId());
  return (
    <svg viewBox="0 0 30 50" aria-hidden="true" className="h-auto w-full overflow-visible">
      <FloraDefs f={f} />
      <PhotoCalla f={f} x={3} y={50} height={44} rot={32} />
      <PhotoCalla f={f} x={7} y={52} height={32} rot={58} />
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
  const env = `wd-env-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const music = useMusicBox();

  // 봉투 터치 = 사용자 동작이라 이 안에서 음악을 켜면 브라우저 자동재생 차단에 걸리지 않는다.
  // AudioContext 생성·resume 은 동기적으로 시작돼야 하므로 열기보다 먼저 부른다.
  const handleOpen = () => {
    music.start();
    onOpen();
  };
  const sealed = phase === "sealed";
  const flapClosed = phase === "sealed" || phase === "opening";
  const cardOut = phase === "rising" || phase === "blooming" || phase === "done";
  const bloom = phase === "blooming" || phase === "done";
  const done = phase === "done";
  const velvet = { filter: `url(#${env}-velvet)` };

  return (
    <section
      aria-labelledby="wd-hero-title"
      className="wd-screen relative flex flex-col items-center justify-center overflow-hidden px-4
        pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="wd-stage @container relative aspect-[2/3]">
        <VelvetDefs id={env} />

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

        {/* z1 봉투 뒤판 — 바닥에 닿은 짙고 짧은 그림자 + 멀리 퍼지는 옅은 그림자로 봉투가 떠 보인다 */}
        <div className="pointer-events-none absolute z-[1] aspect-[1.45]" style={place(ENV)}>
          <svg
            viewBox="0 0 100 69"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full overflow-visible [filter:drop-shadow(0_1.5px_1.5px_rgb(59_47_34/0.28))_drop-shadow(0_12px_14px_rgb(59_47_34/0.24))]"
          >
            <rect x="0.3" y="0.3" width="99.4" height="68.4" rx="1.2" className="fill-wd-velvet-inner" style={velvet} />
            <rect x="0.3" y="0.3" width="99.4" height="68.4" rx="1.2" fill={`url(#${env}-inside)`} />
          </svg>
        </div>

        {/* 덮개 — 닫혀 있을 땐 맨 위, 넘어간 뒤에는 사진·꽃·카드보다 뒤 (z-index 는 className 으로: motion style 의 zIndex 는 갱신되지 않는다) */}
        <div
          className={cn("pointer-events-none absolute aspect-[1.45]", flapClosed ? "z-30" : "z-[2]")}
          style={place(ENV)}
        >
          <motion.div
            className="absolute inset-x-0 top-0 h-[61%] [filter:drop-shadow(0_1px_1px_rgb(0_0_0/0.22))_drop-shadow(0_4px_5px_rgb(0_0_0/0.14))]"
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
              <path d={FLAP} className="fill-wd-velvet" style={velvet} />
              <path d={FLAP} fill={`url(#${env}-flap)`} />
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
            onClick={handleOpen}
            disabled={!sealed}
            aria-label="청첩장 열기"
            className="group absolute inset-0 cursor-pointer rounded-[3px] disabled:cursor-default"
          >
            {/* 앞주머니 = 양옆 날개 위에 아랫날개. 주머니 윗변(V)이 안에 든 카드 위로 그림자를 드리운다 */}
            <svg
              viewBox="0 0 100 69"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="absolute inset-0 h-full w-full overflow-visible [filter:drop-shadow(0_-1px_1.5px_rgb(0_0_0/0.16))_drop-shadow(0_-3px_5px_rgb(0_0_0/0.08))]"
            >
              <path d={SIDE_R} className="fill-wd-velvet" style={velvet} />
              <path d={SIDE_R} fill={`url(#${env}-side-r)`} />
              <path d={SIDE_L} className="fill-wd-velvet" style={velvet} />
              <path d={SIDE_L} fill={`url(#${env}-side-l)`} />
              <g clipPath={`url(#${env}-pocket)`}>
                <path d={BOTTOM} fill="#000000" opacity="0.35" transform="translate(0 -0.6)" filter={`url(#${env}-ao)`} />
              </g>
              <path d={BOTTOM} className="fill-wd-velvet" style={velvet} />
              <path d={BOTTOM} fill={`url(#${env}-bottom)`} />
            </svg>
          </button>
        </div>

        {/* 봉인 상태의 칼라 — 꽃이 피면 부케 쪽으로 사라진다 */}
        <motion.div
          className="wd-sealed-only pointer-events-none absolute z-[8]"
          style={place({ x: 73, y: 96, w: 23 })}
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
          <SceneLp monogram={data.monogram} playing={music.playing} onToggle={music.toggle} />
        </motion.div>

        {/* 봉인 안내 — LP 문구 자리에 먼저 있다가 사라진다 */}
        <motion.p
          className="wd-sealed-only pointer-events-none absolute inset-x-0 top-[91%] text-center"
          initial={false}
          animate={{ opacity: sealed ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="wd-hint block text-[clamp(0.75rem,3.6cqw,0.95rem)] tracking-[0.15em] text-wd-ink">
            봉투를 눌러 열어 주세요
          </span>
          <span lang="en" className="mt-[1cqw] block font-wd-display text-[clamp(0.55rem,2.6cqw,0.72rem)] tracking-[0.3em] text-wd-ink-muted">
            TOUCH TO OPEN
          </span>
        </motion.p>
      </div>
    </section>
  );
}
