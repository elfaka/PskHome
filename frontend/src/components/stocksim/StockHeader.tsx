import type { StockOverview } from "@/api/stockSim";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import {
  changeTone,
  formatClock,
  formatKrwCompact,
  formatNumber,
  formatPercent,
  formatRate,
  formatShares,
  TONE_TEXT,
} from "@/lib/stocksim/format";

/**
 * 종목 헤더 — 현재가·등락과 그 아래 한 줄짜리 시세 요약 (증권사 화면의 "종목 시세 바").
 * 가격 칸은 전일 종가 대비로 색을 칠한다 (시·고·저가도 마찬가지).
 */
export default function StockHeader({
  name,
  symbol,
  overview,
  error,
  watched,
  onToggleWatch,
}: {
  name: string;
  symbol: string;
  overview: StockOverview | null;
  error: string | null;
  watched: boolean;
  onToggleWatch: () => void;
}) {
  const o = overview;
  const tone = TONE_TEXT[changeTone(o?.change)];
  const priceTone = (v: number | null) =>
    v == null || o?.prevClose == null ? "text-fg" : TONE_TEXT[changeTone(v - o.prevClose)];

  const stats: { label: string; value: string; className?: string }[] = o
    ? [
        { label: "시가", value: o.open == null ? "-" : formatNumber(o.open), className: priceTone(o.open) },
        { label: "고가", value: o.high == null ? "-" : formatNumber(o.high), className: priceTone(o.high) },
        { label: "저가", value: o.low == null ? "-" : formatNumber(o.low), className: priceTone(o.low) },
        { label: "거래량", value: o.volume == null ? "-" : formatShares(o.volume) },
        { label: "52주 최고", value: o.high52w == null ? "-" : formatNumber(o.high52w) },
        { label: "52주 최저", value: o.low52w == null ? "-" : formatNumber(o.low52w) },
        { label: "상한가", value: o.upperLimit == null ? "-" : formatNumber(o.upperLimit), className: TONE_TEXT.up },
        { label: "하한가", value: o.lowerLimit == null ? "-" : formatNumber(o.lowerLimit), className: TONE_TEXT.down },
        { label: "시가총액", value: o.marketCap == null ? "-" : formatKrwCompact(o.marketCap) },
        { label: "PER", value: o.valuation?.per == null ? "-" : `${o.valuation.per.toFixed(2)}배` },
        { label: "PBR", value: o.valuation?.pbr == null ? "-" : `${o.valuation.pbr.toFixed(2)}배` },
        {
          label: "배당수익률",
          value: o.valuation?.dividendYield == null ? "-" : formatPercent(o.valuation.dividendYield),
        },
      ]
    : [];

  return (
    <section aria-label="종목 시세" className="px-3 py-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleWatch}
              aria-pressed={watched}
              aria-label={watched ? "관심종목에서 빼기" : "관심종목에 추가"}
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-control text-lg leading-none transition hover:bg-surface-hover",
                watched ? "text-warning" : "text-fg-subtle"
              )}
            >
              {watched ? "★" : "☆"}
            </button>
            <h1 className="truncate text-lg font-semibold text-fg">{o?.name ?? name}</h1>
            <span className="font-mono text-xs text-fg-subtle">{symbol}</span>
            {o?.market && <Badge>{o.market}</Badge>}
            {o?.tradingSuspended && <Badge tone="warning">거래정지</Badge>}
          </div>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 pl-9">
            {o?.price != null ? (
              <>
                <span className={cn("text-3xl font-bold tracking-tight tabular-nums", tone)}>
                  {formatNumber(o.price)}
                  <span className="ml-0.5 text-base font-semibold">원</span>
                </span>
                {o.change != null && o.changeRate != null && (
                  <span className={cn("text-sm font-medium tabular-nums", tone)}>
                    {o.change > 0 ? "▲" : o.change < 0 ? "▼" : ""} {formatNumber(Math.abs(o.change))} ({formatRate(o.changeRate)})
                  </span>
                )}
                {o.priceTime && <span className="text-xs text-fg-subtle">{formatClock(o.priceTime)} 기준</span>}
              </>
            ) : error ? null : (
              <Skeleton className="h-9 w-56" />
            )}
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 pl-9 text-sm text-danger-soft-fg">
          {error}
        </p>
      )}

      {o && (
        <dl className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-x-4 gap-y-2 border-t border-line pt-3 text-xs">
          {stats.map((s) => (
            <div key={s.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-fg-subtle">{s.label}</dt>
              <dd className={cn("font-medium whitespace-nowrap tabular-nums", s.className ?? "text-fg")}>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
