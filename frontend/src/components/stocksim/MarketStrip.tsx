"use client";

import type { FearGreed, MarketIndex, MarketIndexSymbol } from "@/api/stockSim";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { FEAR_GREED_TEXT } from "@/lib/stocksim/fearGreed";
import { changeTone, formatNumber, formatRate, TONE_TEXT } from "@/lib/stocksim/format";

/** 당일 추이선. 점선은 전일 종가. 색은 등락 색(currentColor)을 따른다. */
function Sparkline({ points, base, className }: { points: MarketIndex["intraday"]; base: number | null; className: string }) {
  const W = 64;
  const H = 28;
  if (points.length < 2) return <span className="h-7 w-16" aria-hidden />;

  const values = points.map((p) => p.value);
  if (base != null) values.push(base);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const y = (v: number) => H - 2 - ((v - min) / range) * (H - 4);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("h-7 w-16 shrink-0", className)} aria-hidden>
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

const item =
  "flex shrink-0 items-center gap-3 rounded-card border border-line bg-surface px-3 py-1.5 text-left transition hover:border-line-strong";

/**
 * 화면 상단 지수 띠 — 코스피·코스닥(값·등락·당일 추이)과 공포·탐욕 지수.
 * 누르면 아래 분석 영역의 "시장" 탭을 연다.
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
      <p role="alert" className="px-1 text-xs text-danger-soft-fg">
        {error}
      </p>
    ) : (
      <Skeleton className="h-11 w-full max-w-xl" />
    );
  }

  return (
    <section aria-label="시장 지수" className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-1 sm:-mx-3 sm:px-3">
      {indices.map((idx) => {
        const tone = TONE_TEXT[changeTone(idx.change)];
        return (
          <button key={idx.symbol} type="button" onClick={() => onOpen(idx.symbol)} className={item}>
            <span className="min-w-0">
              <span className="block text-xs font-medium text-fg-muted">{idx.name}</span>
              <span className={cn("block text-sm font-semibold tabular-nums", tone)}>{formatNumber(idx.value, 2)}</span>
            </span>
            <span className={cn("text-right text-[11px] tabular-nums", tone)}>
              <span className="block">
                {idx.change == null ? "-" : `${idx.change > 0 ? "▲" : idx.change < 0 ? "▼" : ""}${formatNumber(Math.abs(idx.change), 2)}`}
              </span>
              <span className="block">{idx.changeRate == null ? "" : formatRate(idx.changeRate)}</span>
            </span>
            <Sparkline points={idx.intraday} base={idx.prevClose} className={tone} />
          </button>
        );
      })}

      {fearGreed && (
        <button type="button" onClick={() => onOpen("fearGreed")} className={item} aria-label={`공포·탐욕 지수 ${fearGreed.score} ${fearGreed.label}`}>
          <span>
            <span className="block text-xs font-medium text-fg-muted">공포·탐욕</span>
            <span className={cn("block text-sm font-semibold tabular-nums", FEAR_GREED_TEXT[fearGreed.level])}>
              {fearGreed.score} <span className="text-xs font-medium">{fearGreed.label}</span>
            </span>
          </span>
          <span className="relative h-1.5 w-20 rounded-full bg-gradient-to-r from-info via-surface-2 to-danger" aria-hidden>
            <span
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-fg"
              style={{ left: `${fearGreed.score}%` }}
            />
          </span>
        </button>
      )}
    </section>
  );
}
