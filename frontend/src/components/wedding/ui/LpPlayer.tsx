"use client";

import { cn } from "@/lib/cn";

import { Monogram } from "./Ornaments";
import { useMusicBox } from "./useMusicBox";

/** 톤암 — 오른쪽 위 축을 중심으로 돌아 재생 중에만 홈 위에 내려앉는다 */
function Tonearm({ playing }: { playing: boolean }) {
  return (
    <svg
      viewBox="0 0 60 100"
      aria-hidden="true"
      className="pointer-events-none absolute -top-[4%] -right-[14%] w-[42%] overflow-visible transition-[rotate] duration-700 ease-out"
      style={{ transformOrigin: "80% 10%", rotate: playing ? "0deg" : "-22deg" }}
    >
      <circle cx="48" cy="10" r="7" className="fill-wd-paper stroke-wd-ink-muted" strokeWidth="1.2" />
      <circle cx="48" cy="10" r="2.4" className="fill-wd-ink-muted" />
      <path d="M48 10 L 44 58 L 22 76" fill="none" className="stroke-wd-ink-muted" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="72" width="11" height="7" rx="1.5" transform="rotate(-38 19.5 75.5)" className="fill-wd-ink" />
    </svg>
  );
}

export default function LpPlayer({ data, className }: { data: { monogram: string }; className?: string }) {
  const { playing, toggle } = useMusicBox();

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative w-full">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={playing}
          aria-label={playing ? "배경음악 멈추기" : "배경음악 재생"}
          className="relative block aspect-square w-full rounded-full shadow-wd-letter"
        >
          {/* 도는 부분: 홈 + 라벨. 반사광은 돌지 않아야 진짜 LP 처럼 보여 따로 둔다 */}
          <span
            aria-hidden="true"
            className="wd-vinyl wd-spin absolute inset-0 rounded-full"
            style={{ animationPlayState: playing ? "running" : "paused" }}
          >
            <span className="wd-paper-texture absolute inset-[31%] flex flex-col items-center justify-center rounded-full bg-wd-sage-deep text-wd-paper">
              <Monogram text={data.monogram} className="w-[40%]" />
              <span lang="en" className="mt-[4%] font-wd-display text-[0.45rem] tracking-[0.25em]">
                SIDE A
              </span>
            </span>
            <span className="absolute top-1/2 left-1/2 size-[4%] -translate-1/2 rounded-full bg-wd-ivory" />
          </span>
          <span aria-hidden="true" className="wd-vinyl-sheen pointer-events-none absolute inset-0 rounded-full" />
        </button>
        <Tonearm playing={playing} />
      </div>

      <p aria-hidden="true" lang="en" className="mt-4 font-wd-display text-[0.72rem] font-medium tracking-[0.32em] text-wd-ink">
        {playing ? "TAP TO PAUSE" : "TAP TO PLAY"}
      </p>
    </div>
  );
}
