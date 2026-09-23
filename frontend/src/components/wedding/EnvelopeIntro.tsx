"use client";

import { motion } from "motion/react";

import type { WeddingData } from "@/data/wedding";
import { cn } from "@/lib/cn";
import { pad2, parseCeremonyDate } from "@/lib/wedding/ceremony";

import type { IntroPhase } from "./introMachine";
import { CallaLily, Monogram } from "./ui/Ornaments";

const EASE_PAPER = [0.65, 0, 0.35, 1] as const;

/*
  연출 길이는 introMachine.PHASE_MAX_MS 안에 들어와야 한다.
    opening   = 실링 0.3s 후 덮개 0.65s  (≤ 1.1s)
    rising    = 편지 0.8s                (≤ 0.9s)
    unfolding = 등장 0.45s, 윗장 0.45s+0.5s, 아랫장 0.9s+0.5s (≤ 1.5s)
*/

export default function EnvelopeIntro({
  phase,
  data,
  onOpen,
  onPhaseDone,
}: {
  phase: IntroPhase;
  data: WeddingData;
  onOpen: () => void;
  onPhaseDone: (from: IntroPhase) => void;
}) {
  const sealed = phase === "sealed";
  const flapOpen = !sealed;
  const letterOut = phase === "rising" || phase === "unfolding" || phase === "done";
  const leaving = phase === "unfolding" || phase === "done";
  const date = parseCeremonyDate(data.ceremony.date);

  return (
    <motion.div
      // 예상 밖의 작은 창(폴더블 분할 화면 등)에서 넘치면 인트로 안에서만 스크롤된다
      className="wd-intro fixed inset-0 z-50 overflow-x-hidden overflow-y-auto overscroll-contain bg-wd-ivory"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div
        className="grid min-h-full w-full content-center justify-items-center gap-y-6 px-6
          pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]
          wd-cover:gap-y-4 wd-unfolded:gap-y-8
          wd-landscape:grid-cols-[auto_auto] wd-landscape:justify-center wd-landscape:gap-x-12 wd-landscape:gap-y-3"
      >
        <motion.div
          className="text-center wd-landscape:col-start-1 wd-landscape:row-start-1 wd-landscape:self-end"
          animate={letterOut ? { opacity: 0, y: -24 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <p lang="en" className="font-wd-display text-[0.8rem] font-medium tracking-[0.3em] text-wd-ink">
            YOU HAVE MAIL FROM
          </p>
          <p
            lang="en"
            className="mt-2 font-wd-script text-[clamp(2.5rem,12vw,4rem)] leading-[1.05] text-wd-ink
              wd-unfolded:text-[4.25rem] wd-landscape:text-[clamp(2rem,9svh,3.25rem)]"
          >
            {data.groom.nameEn}
            <br />
            <span className="text-[0.8em]">&amp;</span> {data.bride.nameEn}
          </p>
          <p className="mt-3 text-sm tracking-[0.2em] text-wd-ink-muted">
            {data.groom.name} · {data.bride.name}
          </p>
        </motion.div>

        <motion.div
          className="wd-envelope relative wd-landscape:col-start-2 wd-landscape:row-span-2 wd-landscape:row-start-1 wd-landscape:self-center"
          animate={
            leaving
              ? { opacity: 0, y: "30%" }
              : letterOut
                ? { opacity: 1, y: "22%" }
                : { opacity: 1, y: "0%" }
          }
          transition={{ duration: leaving ? 0.45 : 0.8, ease: EASE_PAPER }}
        >
          <button
            type="button"
            onClick={onOpen}
            disabled={!sealed}
            aria-label="청첩장 열기"
            className="group relative block aspect-[1.45] w-full cursor-pointer rounded-[3px] disabled:cursor-default"
          >
            {/* 봉투 안쪽 */}
            <span className="absolute inset-0 rounded-[3px] bg-wd-sage-inner shadow-wd-card" />

            {/* 편지 — 앞주머니 뒤에서 올라온다 */}
            <motion.span
              className="wd-paper-texture absolute inset-x-[6%] top-[5%] bottom-[6%] z-10 flex flex-col items-center justify-start gap-[6%] rounded-[2px] bg-wd-paper pt-[7%] shadow-wd-card"
              initial={false}
              animate={{ y: letterOut ? "-62%" : "0%" }}
              transition={{ duration: 0.8, ease: EASE_PAPER }}
              onAnimationComplete={() => onPhaseDone("rising")}
            >
              <Monogram text={data.monogram} className="w-[16%] text-wd-sage-deep" />
              <span lang="en" className="font-wd-display text-[clamp(0.55rem,2.6vw,0.8rem)] tracking-[0.3em] text-wd-ink">
                WEDDING INVITATION
              </span>
              <span className="font-wd-display text-[clamp(0.6rem,2.8vw,0.85rem)] tracking-[0.2em] text-wd-ink-muted">
                {date.year}. {pad2(date.month)}. {pad2(date.day)}
              </span>
            </motion.span>

            {/* 앞주머니 — 위쪽이 V 자로 파여 편지가 보인다 */}
            <svg
              viewBox="0 0 100 69"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="absolute inset-0 z-20 h-full w-full overflow-visible drop-shadow-[0_-1px_1px_rgb(0_0_0/0.06)]"
            >
              <path d="M0 0 L46 37 Q50 40 54 37 L100 0 V69 H0 Z" className="fill-wd-sage" />
              <path
                d="M0 69 L41 39 M100 69 L59 39"
                className="stroke-wd-sage-inner"
                strokeWidth="0.35"
                opacity="0.5"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/* 덮개 — 윗변을 축으로 뒤로 넘어간다. 넘어간 뒤에는 편지보다 뒤로 보낸다 */}
            <motion.svg
              viewBox="0 0 100 42"
              preserveAspectRatio="none"
              aria-hidden="true"
              // z-index 는 className 으로 바꾼다 — motion 의 style 로 넘긴 정적 zIndex 는 재렌더 때 갱신되지 않는다
              className={cn(
                "absolute inset-x-0 top-0 h-[61%] w-full overflow-visible drop-shadow-[0_2px_2px_rgb(0_0_0/0.12)]",
                phase === "sealed" || phase === "opening" ? "z-30" : "z-[5]",
              )}
              style={{ transformOrigin: "50% 0%", transformPerspective: 900 }}
              initial={false}
              animate={{ rotateX: flapOpen ? 180 : 0 }}
              transition={{ duration: 0.65, delay: flapOpen ? 0.3 : 0, ease: EASE_PAPER }}
              onAnimationComplete={() => onPhaseDone("opening")}
            >
              <path d="M0 0 H100 L55 38 Q50 42 45 38 Z" className="fill-wd-sage" />
            </motion.svg>

            {/* 실링 */}
            <motion.span
              className="absolute top-[33%] left-1/2 z-40 w-[15%] -translate-x-1/2 text-wd-paper"
              initial={false}
              animate={sealed ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Monogram text={data.monogram} className="w-full transition-transform duration-300 group-hover:scale-105" />
            </motion.span>
          </button>

          <CallaLily className="pointer-events-none absolute -right-[7%] -bottom-[14%] z-50 w-[20%] rotate-[8deg]" />
        </motion.div>

        <motion.p
          className="text-center wd-landscape:col-start-1 wd-landscape:row-start-2 wd-landscape:self-start"
          animate={{ opacity: sealed ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="wd-hint block text-sm tracking-[0.15em] text-wd-ink">
            봉투를 눌러 열어 주세요
          </span>
          <span lang="en" className="mt-1 block font-wd-display text-[0.7rem] tracking-[0.3em] text-wd-ink-muted">
            CLICK ENVELOPE TO OPEN
          </span>
        </motion.p>
      </div>

      {leaving && <UnfoldPaper onDone={() => onPhaseDone("unfolding")} />}
    </motion.div>
  );
}

/**
 * 세 겹으로 접힌 편지가 화면 가득 펼쳐진다.
 * 접을 때 아랫장 → 윗장 순이었으므로 펼칠 때는 윗장 → 아랫장 순이다.
 * 3D 컨텍스트(preserve-3d)를 쓰지 않고 z-index 로 겹침을 정해 같은 평면의 깜빡임을 피한다.
 */
function UnfoldPaper({ onDone }: { onDone: () => void }) {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] flex flex-col"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: EASE_PAPER }}
    >
      <motion.div
        className="relative z-[3] h-1/3 bg-linear-to-b from-wd-paper to-wd-ivory"
        style={{ transformOrigin: "50% 100%", transformPerspective: 1400 }}
        initial={{ rotateX: -180 }}
        animate={{ rotateX: 0 }}
        transition={{ duration: 0.5, delay: 0.45, ease: EASE_PAPER }}
      />
      <div className="relative z-[1] h-1/3 border-y border-wd-line/40 bg-wd-paper" />
      <motion.div
        className="relative z-[2] h-1/3 bg-linear-to-t from-wd-paper to-wd-ivory"
        style={{ transformOrigin: "50% 0%", transformPerspective: 1400 }}
        initial={{ rotateX: 180 }}
        animate={{ rotateX: 0 }}
        transition={{ duration: 0.5, delay: 0.9, ease: EASE_PAPER }}
        onAnimationComplete={onDone}
      />
    </motion.div>
  );
}
