"use client";

import { useId } from "react";

import { Monogram } from "../ui/Ornaments";

/**
 * 봉투 아랫변에 걸친 LP. 음악은 봉투를 터치할 때 함께 시작되고(EnvelopeScene), 여기서는 멈춤/재생만 한다.
 * 아래 곡선 문구는 봉투 밖 아이보리 바탕에 오도록 LP 위치(geometry.LP)를 잡았다 — 세이지 위 흰 글씨는 명암비 미달.
 */
export default function SceneLp({
  monogram,
  playing,
  onToggle,
}: {
  monogram: string;
  playing: boolean;
  onToggle: () => void;
}) {
  const arcId = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-arc`;

  return (
    <div className="relative aspect-square w-full">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={playing}
        aria-label={playing ? "배경음악 멈추기" : "배경음악 재생"}
        className="absolute inset-0 rounded-full shadow-wd-letter"
      >
        {/* 도는 부분: 홈 + 라벨 */}
        <span
          aria-hidden="true"
          className="wd-vinyl wd-spin absolute inset-0 rounded-full"
          style={{ animationPlayState: playing ? "running" : "paused" }}
        >
          <span className="wd-paper-texture absolute inset-[30%] flex items-center justify-center rounded-full bg-wd-sage-deep text-wd-paper">
            <Monogram text={monogram} className="w-[46%] opacity-80" />
          </span>
        </span>
        {/* 반사광과 재생 버튼은 돌지 않는다 */}
        <span aria-hidden="true" className="wd-vinyl-sheen pointer-events-none absolute inset-0 rounded-full" />
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 flex size-[24%] -translate-1/2 items-center justify-center rounded-full bg-wd-ink/55 text-wd-paper ring-1 ring-wd-paper/40"
        >
          <svg viewBox="0 0 20 20" className="w-[46%]" fill="currentColor">
            {playing ? (
              <>
                <rect x="4.5" y="3.5" width="4" height="13" rx="1" />
                <rect x="11.5" y="3.5" width="4" height="13" rx="1" />
              </>
            ) : (
              <path d="M6 3.8 L16.2 10 L6 16.2 Z" />
            )}
          </svg>
        </span>
      </button>

      {/* 아래로 휘는 문구 — 원 중심 (50,50), 반지름 58 의 아랫 호 */}
      <svg viewBox="0 0 100 100" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <path id={arcId} d="M 2.5 83.3 A 58 58 0 0 0 97.5 83.3" fill="none" />
        <text className="fill-wd-ink font-wd-display" fontSize="10" fontWeight="500" letterSpacing="2.6">
          <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
            {playing ? "TAP TO PAUSE" : "TAP TO PLAY"}
          </textPath>
        </text>
      </svg>
    </div>
  );
}
