"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import type { WeddingData } from "@/data/wedding";
import { cn } from "@/lib/cn";

import InvitationCard from "./InvitationCard";
import { type Geom, introLayout } from "./introLayout";
import type { IntroPhase } from "./introMachine";
import FreshFlowers from "./ui/FreshFlowers";
import { CallaLily, Monogram } from "./ui/Ornaments";

const EASE_PAPER = [0.65, 0, 0.35, 1] as const;
const EASE_CARD = [0.45, 0, 0.2, 1] as const;
const EASE_DROP = [0.55, 0, 0.75, 0.2] as const;

/*
  연출 길이는 introMachine.PHASE_MAX_MS 안에 들어와야 한다.
    opening    = 실링 0.3s 후 덮개 0.65s (≤ 1.1s)
    rising     = 카드 0.8s              (≤ 0.9s)
    presenting = 카드 1.0s, 봉투 0.85s   (≤ 1.1s)
  위치·크기 계산은 introLayout.ts (단위 테스트 있음).
*/

function readGeom(stage: HTMLElement, target: HTMLElement): Geom {
  const s = stage.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  return {
    stageX: s.left,
    stageY: s.top,
    envW: s.width,
    envH: s.height,
    cardX: t.left,
    cardY: t.top,
    cardW: t.width,
    vh: window.innerHeight,
  };
}

export default function EnvelopeIntro({
  phase,
  data,
  targetRef,
  onOpen,
  onPhaseDone,
}: {
  phase: IntroPhase;
  data: WeddingData;
  /** 첫 화면의 카드 — 꺼낸 카드가 도착할 자리 */
  targetRef: React.RefObject<HTMLDivElement | null>;
  onOpen: () => void;
  onPhaseDone: (from: IntroPhase) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<Geom | null>(null);

  // 크기·위치를 잰다. 폴더블을 접고 펴거나 회전하면 다시 재고, motion 이 새 목표로 이어서 움직인다
  useEffect(() => {
    const stage = stageRef.current;
    const target = targetRef.current;
    if (!stage || !target) return;

    const measure = () => setGeom(readGeom(stage, target));

    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    ro.observe(target);
    window.addEventListener("resize", measure);
    // 웹폰트가 늦게 오면 첫 화면 카드 높이가 바뀌어 위치가 밀린다
    void document.fonts?.ready.then(measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [targetRef]);

  // 카드를 꺼내기 직전·날려 보내기 직전에 한 번 더 잰다 (그사이 레이아웃이 바뀌었을 수 있다)
  useEffect(() => {
    if (phase !== "rising" && phase !== "presenting") return;
    const stage = stageRef.current;
    const target = targetRef.current;
    if (!stage || !target) return;
    const id = requestAnimationFrame(() => setGeom(readGeom(stage, target)));
    return () => cancelAnimationFrame(id);
  }, [phase, targetRef]);

  const sealed = phase === "sealed";
  const cardOut = phase === "rising" || phase === "presenting" || phase === "done";
  const leaving = phase === "presenting" || phase === "done";

  // 측정 전(서버·첫 페인트)에는 봉투만 제자리에 두고 카드는 숨긴다
  const layout = geom ? introLayout(phase, geom) : null;
  // 봉투 레이어 4개(뒤판·덮개·카드 클립·앞주머니)가 같은 값·같은 곡선으로 함께 움직인다
  const moverAnimate = layout?.envelope ?? { y: 0, opacity: 1 };
  const moverTransition = leaving
    ? { duration: 0.85, ease: EASE_DROP }
    : { duration: 0.8, ease: EASE_PAPER };
  const cardTransition = leaving
    ? { duration: 1, ease: EASE_CARD }
    : cardOut
      ? { duration: 0.8, ease: EASE_PAPER }
      : { duration: 0 };

  return (
    <motion.div
      // 예상 밖의 작은 창(폴더블 분할 화면 등)에서 넘치면 인트로 안에서만 스크롤된다
      // 카드가 제자리로 날아가는 동안·사라지는 동안에는 뒤 본문(LP 등) 탭을 막지 않는다
      className={cn(
        "wd-intro fixed inset-0 z-50 overflow-x-hidden overflow-y-auto overscroll-contain bg-wd-ivory",
        leaving && "pointer-events-none",
      )}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div
        // overflow-clip: 봉투 밖으로 넓게 깔린 생화 상자가 스크롤 영역을 늘리지 않게 한다 (실제 내용이 넘칠 때의 스크롤은 유지)
        className="grid min-h-full w-full content-center justify-items-center gap-y-6 overflow-clip px-6
          pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]
          wd-cover:gap-y-4 wd-unfolded:gap-y-8
          wd-landscape:grid-cols-[auto_auto] wd-landscape:justify-center wd-landscape:gap-x-16 wd-landscape:gap-y-3"
      >
        <motion.div
          className="text-center wd-landscape:col-start-1 wd-landscape:row-start-1 wd-landscape:self-end"
          animate={cardOut ? { opacity: 0, y: -24 } : { opacity: 1, y: 0 }}
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

        {/* 무대 — 자리만 잡는 고정 상자. 움직이는 건 안쪽 레이어들이다 */}
        <div
          ref={stageRef}
          className="wd-envelope relative aspect-[1.45] wd-landscape:col-start-2 wd-landscape:row-span-2 wd-landscape:row-start-1 wd-landscape:self-center"
        >
          {/* z-1: 생화 + 봉투 뒤판 */}
          <motion.div
            className="pointer-events-none absolute inset-0 z-[1]"
            initial={false}
            animate={moverAnimate}
            transition={moverTransition}
          >
            <FreshFlowers className="absolute top-[-30%] left-[-22%] w-[144%]" />
            <span className="absolute inset-0 rounded-[3px] bg-wd-sage-inner shadow-wd-letter" />
            <span className="wd-colored-paper absolute inset-0 rounded-[3px]" />
          </motion.div>

          {/* 덮개 — 닫혀 있을 땐 맨 위, 넘어간 뒤에는 카드보다 뒤 (className 으로 바꾼다: motion style 의 zIndex 는 갱신되지 않는다) */}
          <motion.div
            className={cn(
              "pointer-events-none absolute inset-0",
              phase === "sealed" || phase === "opening" ? "z-30" : "z-[5]",
            )}
            initial={false}
            animate={moverAnimate}
            transition={moverTransition}
          >
            <motion.div
              className="absolute inset-x-0 top-0 h-[61%] drop-shadow-[0_2px_2px_rgb(0_0_0/0.14)]"
              style={{ transformOrigin: "50% 0%", transformPerspective: 900 }}
              initial={false}
              animate={{ rotateX: sealed ? 0 : 180 }}
              transition={{ duration: 0.65, delay: sealed ? 0 : 0.3, ease: EASE_PAPER }}
              onAnimationComplete={() => onPhaseDone("opening")}
            >
              <svg viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
                <path d="M0 0 H100 L55 38 Q50 42 45 38 Z" className="fill-wd-sage" />
              </svg>
              <span
                className="wd-colored-paper absolute inset-0"
                style={{ clipPath: "polygon(0% 0%, 100% 0%, 54% 91%, 50% 99%, 46% 91%)" }}
              />
              <motion.span
                className="absolute top-[54%] left-1/2 w-[15%] -translate-x-1/2 text-wd-paper"
                initial={false}
                animate={sealed ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <Monogram text={data.monogram} className="w-full drop-shadow-[0_1px_1px_rgb(0_0_0/0.18)]" />
              </motion.span>
            </motion.div>
          </motion.div>

          {/*
            z-10: 카드 — 봉투 아랫변 아래로는 잘린다.
            측정이 끝난 뒤에 마운트한다: animate 가 undefined → 값으로 바뀌면 initial={false} 인 motion 이
            첫 값을 적용하지 않는 것을 확인했다. 마운트 시점의 animate 가 곧 초기값이 되게 한다.
          */}
          {layout && geom && (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10"
              initial={false}
              animate={{ clipPath: layout.clipPath }}
              transition={leaving ? moverTransition : cardTransition}
            >
              <motion.div
                className="absolute top-0 left-0"
                style={{ width: geom.cardW, transformOrigin: "50% 0%" }}
                initial={false}
                animate={layout.card}
                transition={cardTransition}
                onAnimationComplete={() => {
                  if (phase === "rising" || phase === "presenting") onPhaseDone(phase);
                }}
              >
                <InvitationCard variant="copy" data={data} />
              </motion.div>
            </motion.div>
          )}

          {/* z-20: 앞주머니 — 위쪽이 V 자로 파여 카드가 보인다. 누르는 곳도 여기 */}
          <motion.div className="absolute inset-0 z-20" initial={false} animate={moverAnimate} transition={moverTransition}>
            <button
              type="button"
              onClick={onOpen}
              disabled={!sealed}
              aria-label="청첩장 열기"
              className="group absolute inset-0 cursor-pointer rounded-[3px] disabled:cursor-default"
            >
              <svg
                viewBox="0 0 100 69"
                preserveAspectRatio="none"
                aria-hidden="true"
                className="absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_-1px_1px_rgb(0_0_0/0.06)]"
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
              <span
                className="wd-colored-paper absolute inset-0 rounded-b-[3px]"
                style={{ clipPath: "polygon(0% 0%, 46% 53.6%, 50% 58%, 54% 53.6%, 100% 0%, 100% 100%, 0% 100%)" }}
              />
              {/* 봉투를 가볍게 누르면 살짝 들린다 */}
              <span className="absolute inset-0 rounded-[3px] transition-colors duration-300 group-hover:bg-white/5 group-active:bg-black/5" />
            </button>
            <CallaLily className="pointer-events-none absolute -right-[7%] -bottom-[14%] w-[20%] rotate-[8deg]" />
          </motion.div>
        </div>

        <motion.p
          className="text-center wd-landscape:col-start-1 wd-landscape:row-start-2 wd-landscape:self-start"
          animate={{ opacity: sealed ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="wd-hint block text-sm tracking-[0.15em] text-wd-ink">봉투를 눌러 열어 주세요</span>
          <span lang="en" className="mt-1 block font-wd-display text-[0.7rem] tracking-[0.3em] text-wd-ink-muted">
            CLICK ENVELOPE TO OPEN
          </span>
        </motion.p>
      </div>
    </motion.div>
  );
}
