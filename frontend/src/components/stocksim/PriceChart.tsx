import type { CandlePoint } from "@/api/stockSim";
import { cn } from "@/lib/cn";
import { kstDate } from "@/lib/stocksim/candles";
import { changeTone, formatWon, TONE_TEXT } from "@/lib/stocksim/format";

const W = 600;
const H = 160;
const PAD = 8;

/**
 * 일봉 종가 꺾은선 — 차트 라이브러리 없이 SVG 하나로 그린다.
 * 색은 기간 첫 종가 대비 마지막 종가의 등락으로 정한다 (상승 빨강 / 하락 파랑).
 */
export default function PriceChart({ points, className }: { points: CandlePoint[]; className?: string }) {
  if (points.length < 2) {
    return (
      <div className={cn("flex h-40 items-center justify-center text-sm text-fg-subtle", className)}>
        차트 데이터가 없습니다.
      </div>
    );
  }

  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;

  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);

  const line = closes.map((c, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(" ");
  const area = `${line} L${x(closes.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;

  const first = closes[0];
  const last = closes[closes.length - 1];
  const tone = changeTone(last - first);

  return (
    <figure className={cn("m-0", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className={cn("h-40 w-full", TONE_TEXT[tone])}
        role="img"
        aria-label={`최근 ${points.length}거래일 종가 추이: ${formatWon(first)}에서 ${formatWon(last)}, 최고 ${formatWon(max)}, 최저 ${formatWon(min)}`}
      >
        <path d={area} fill="currentColor" fillOpacity={0.08} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-fg-subtle">
        <span>{kstDate(points[0].time)}</span>
        <span>
          최고 {formatWon(max)} · 최저 {formatWon(min)}
        </span>
        <span>{kstDate(points[points.length - 1].time)}</span>
      </figcaption>
    </figure>
  );
}
