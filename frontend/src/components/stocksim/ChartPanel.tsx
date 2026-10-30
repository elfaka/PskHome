"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { getChart, type ChartData, type Timeframe } from "@/api/stockSim";
import { useTheme } from "@/components/theme/useTheme";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { changeTone, formatNumber, formatRate, formatShares, TONE_TEXT } from "@/lib/stocksim/format";
import { usePolling } from "@/lib/stocksim/usePolling";

import type { ChartToggles, HoverBar } from "./CandleChart";

// canvas 차트는 브라우저에서만 그린다. (서버 렌더·테스트 환경에는 canvas 가 없다)
const CandleChart = dynamic(() => import("./CandleChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: "1m", label: "1분" },
  { value: "5m", label: "5분" },
  { value: "15m", label: "15분" },
  { value: "1d", label: "일" },
  { value: "1w", label: "주" },
  { value: "1M", label: "월" },
];

/** 분봉은 1분마다 새 봉이 생기므로 자주, 일봉 이상은 현재가로 마지막 봉만 움직이므로 드물게 받는다. */
const REFRESH_MS: Record<Timeframe, number> = { "1m": 20_000, "5m": 30_000, "15m": 60_000, "1d": 120_000, "1w": 300_000, "1M": 300_000 };

const TOGGLES: { key: keyof ChartToggles; label: string }[] = [
  { key: "ma", label: "이동평균" },
  { key: "bollinger", label: "볼린저" },
  { key: "volume", label: "거래량" },
  { key: "rsi", label: "RSI" },
  { key: "macd", label: "MACD" },
];

const MA_LEGEND = [
  { key: "ma5", label: "5", className: "text-warning-soft-fg" },
  { key: "ma20", label: "20", className: "text-accent-soft-fg" },
  { key: "ma60", label: "60", className: "text-fg" },
  { key: "ma120", label: "120", className: "text-fg-subtle" },
] as const;

function Legend({ data, index, toggles }: { data: ChartData; index: number; toggles: ChartToggles }) {
  const bar = data.candles[index];
  const prev = data.candles[index - 1];
  if (!bar) return null;

  const change = prev ? bar.close - prev.close : null;
  const tone = TONE_TEXT[changeTone(change)];
  const rsi = data.indicators.rsi[index];

  return (
    <div className="pointer-events-none absolute top-2 left-2 z-10 flex max-w-[calc(100%-5rem)] flex-wrap gap-x-3 gap-y-0.5 rounded-control bg-surface/80 px-2 py-1 text-[11px] tabular-nums text-fg-muted backdrop-blur-sm">
      <span>시 <b className="font-medium text-fg">{formatNumber(bar.open)}</b></span>
      <span>고 <b className="font-medium text-danger-soft-fg">{formatNumber(bar.high)}</b></span>
      <span>저 <b className="font-medium text-info-soft-fg">{formatNumber(bar.low)}</b></span>
      <span>
        종 <b className={cn("font-medium", tone)}>{formatNumber(bar.close)}</b>
        {change != null && prev && <span className={cn("ml-1", tone)}>({formatRate(change / prev.close)})</span>}
      </span>
      <span>거래량 <b className="font-medium text-fg">{formatShares(bar.volume)}</b></span>
      {toggles.ma &&
        MA_LEGEND.map((m) => {
          const v = data.indicators[m.key][index];
          return v == null ? null : (
            // 좁은 화면에서는 범례가 차트를 가리지 않게 이동평균 값을 숨긴다.
            <span key={m.key} className={cn("max-sm:hidden", m.className)}>
              MA{m.label} {formatNumber(v)}
            </span>
          );
        })}
      {toggles.rsi && rsi != null && <span>RSI {rsi.toFixed(1)}</span>}
    </div>
  );
}

export default function ChartPanel({
  symbol,
  livePrice,
  liveTime,
}: {
  symbol: string;
  livePrice: number | null;
  liveTime: string | null;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [toggles, setToggles] = useState<ChartToggles>({ ma: true, bollinger: false, volume: true, rsi: true, macd: false });
  const [hover, setHover] = useState<HoverBar | null>(null);
  const { resolved } = useTheme();

  const chart = usePolling(`${symbol}:${timeframe}`, () => getChart(symbol, timeframe), REFRESH_MS[timeframe], "차트를 불러오지 못했습니다.");
  const data = chart.data;
  const legendIndex = hover?.index ?? (data ? data.candles.length - 1 : -1);
  const subPanes = Number(toggles.rsi) + Number(toggles.macd);

  return (
    <section aria-label="차트" className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div role="tablist" aria-label="봉 단위" className="flex items-center gap-0.5 rounded-control bg-surface-2 p-0.5">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={timeframe === t.value}
              onClick={() => setTimeframe(t.value)}
              className={cn(
                "h-7 min-w-9 rounded-control px-2 text-xs font-medium transition",
                timeframe === t.value ? "bg-surface text-fg shadow-card" : "text-fg-muted hover:text-fg"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="group" aria-label="보조지표" className="flex flex-wrap items-center gap-1">
          {TOGGLES.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={toggles[t.key]}
              onClick={() => setToggles((prev) => ({ ...prev, [t.key]: !prev[t.key] }))}
              className={cn(
                "h-7 rounded-control border px-2 text-xs transition",
                toggles[t.key]
                  ? "border-accent/40 bg-accent-soft text-accent-soft-fg"
                  : "border-line text-fg-muted hover:border-line-strong hover:text-fg"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="relative"
        // 아래 지표 패널이 늘어나는 만큼 차트 높이를 키운다.
        style={{ height: `${360 + subPanes * 110}px` }}
      >
        {chart.error && !data ? (
          <div role="alert" className="flex h-full items-center justify-center px-6 text-center text-sm text-danger-soft-fg">
            {chart.error}
          </div>
        ) : data && data.candles.length > 0 ? (
          <>
            <Legend data={data} index={legendIndex} toggles={toggles} />
            <CandleChart
              className="h-full w-full"
              data={data}
              toggles={toggles}
              theme={resolved}
              livePrice={livePrice}
              liveTime={liveTime}
              onHover={setHover}
            />
          </>
        ) : data ? (
          <div className="flex h-full items-center justify-center text-sm text-fg-subtle">차트 데이터가 없습니다.</div>
        ) : (
          <Skeleton className="h-full w-full rounded-none" />
        )}
      </div>
    </section>
  );
}
