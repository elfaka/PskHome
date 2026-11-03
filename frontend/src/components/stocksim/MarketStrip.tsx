"use client";

import type { FearGreed, MarketIndex, MarketIndexSymbol } from "@/api/stockSim";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { FEAR_GREED_TEXT } from "@/lib/stocksim/fearGreed";
import { changeTone, formatNumber, formatRate, TONE_TEXT } from "@/lib/stocksim/format";

/** 당일 추이선. 점선은 전일 종가. 색은 등락 색(currentColor)을 따른다. */
function Sparkline({ points, base, className }: { points: MarketIndex["intraday"]; base: number | null; className: string }) {
  const W = 48;
  const H = 20;
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  if (base != null) values.push(base);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const y = (v: number) => H - 2 - ((v - min) / range) * (H - 4);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("h-5 w-12 shrink-0 max-sm:hidden", className)} aria-hidden>
      {base != null && (
        <line x1={0} x2={W} y1={y(base)} y2={y(base)} className="stroke-line-strong" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      )}
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        points={points.map((p, i) => `${(i / (points.length - 1)) * W},${y(p.value)}`).join(" ")}
      />
    </svg>
  );
}

const chip =
  "flex h-8 shrink-0 items-center gap-2 rounded-control px-2 text-left text-xs whitespace-nowrap transition hover:bg-surface-hover";

/**
 * 상단 바의 지수 요약 — 코스피·코스닥(값·등락률·당일 추이)과 공포·탐욕 지수.
 * 누르면 시장 탭으로 간다.
 */
export default function MarketStrip({
  indices,
  fearGreed,
  error,
  onOpen,
}: {
  indices: MarketIndex[] | null;
  fearGreed: FearGreed | null;
  error: string | null;
  onOpen: (target: MarketIndexSymbol | "fearGreed") => void;
}) {
  if (!indices) {
    return error ? (
      <p role="alert" className="truncate text-xs text-danger-soft-fg">
        {error}
      </p>
    ) : (
      <Skeleton className="h-8 w-72" />
    );
  }

  return (
    <section aria-label="시장 지수" className="flex min-w-0 items-center overflow-x-auto">
      {indices.map((idx) => {
        const tone = TONE_TEXT[changeTone(idx.change)];
        return (
          <button key={idx.symbol} type="button" onClick={() => onOpen(idx.symbol)} className={chip}>
            <span className="font-medium text-fg-muted">{idx.name}</span>
            <span className={cn("font-semibold tabular-nums", tone)}>{formatNumber(idx.value, 2)}</span>
            <span className={cn("tabular-nums", tone)}>
              {idx.change == null ? "" : `${idx.change > 0 ? "▲" : idx.change < 0 ? "▼" : ""}${formatNumber(Math.abs(idx.change), 2)}`}
              {idx.changeRate == null ? "" : ` ${formatRate(idx.changeRate)}`}
            </span>
            <Sparkline points={idx.intraday} base={idx.prevClose} className={tone} />
          </button>
        );
      })}

      {fearGreed && (
        <button
          type="button"
          onClick={() => onOpen("fearGreed")}
          className={chip}
          aria-label={`공포·탐욕 지수 ${fearGreed.score} ${fearGreed.label}`}
        >
          <span className="font-medium text-fg-muted">공포·탐욕</span>
          <span className={cn("font-semibold tabular-nums", FEAR_GREED_TEXT[fearGreed.level])}>
            {fearGreed.score} {fearGreed.label}
          </span>
          <span className="relative h-1.5 w-12 rounded-full bg-gradient-to-r from-info via-surface-2 to-danger max-sm:hidden" aria-hidden>
            <span
              className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-fg"
              style={{ left: `${fearGreed.score}%` }}
            />
          </span>
        </button>
      )}
    </section>
  );
}
