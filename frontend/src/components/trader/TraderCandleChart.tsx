"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

import type { TraderChart } from "@/api/trader";
import { formatNumber } from "@/lib/stocksim/format";

/**
 * 자동매매 종목 차트 (TradingView lightweight-charts, canvas).
 *
 * 캔들 + 거래량 + VWAP·SMA20(1분봉 기준) + 체결 표시(▲매수 ▼매도) + 주문 전략 신호(●) + 보유 중 평균단가·손절·목표가 선.
 * - canvas 라 클래스를 못 쓴다 → CSS 토큰 값을 읽어 색을 정하고 테마가 바뀌면 다시 그린다
 * - lightweight-charts 는 UTC 로 표시하므로 9시간을 더해 KST 로 보이게 한다
 * - 가격을 number 로 바꾸는 것은 픽셀 좌표용이다 (표시 숫자는 범례가 Decimal 문자열 그대로 보여준다)
 */

const KST_OFFSET_S = 9 * 3600;

export function chartTime(iso: string): UTCTimestamp {
  return (Math.floor(Date.parse(iso) / 1000) + KST_OFFSET_S) as UTCTimestamp;
}

function token(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function alpha(hex: string, a: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
}

const num = (v: string | null | undefined): number | null => (v == null || v === "" ? null : Number(v));

type Series = {
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  vwap: ISeriesApi<"Line">;
  sma: ISeriesApi<"Line">;
  markers: ISeriesMarkersPluginApi<Time>;
  priceLines: IPriceLine[];
};

export default function TraderCandleChart({
  data,
  theme,
  onHover,
  className,
}: {
  data: TraderChart;
  theme: "light" | "dark";
  /** 십자선이 가리키는 봉 (없으면 null) */
  onHover?: (index: number | null) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Series | null>(null);
  const colorsRef = useRef<Record<string, string>>({});
  const dataRef = useRef(data);
  const onHoverRef = useRef(onHover);
  const fitted = useRef<string | null>(null);

  useEffect(() => {
    dataRef.current = data;
    onHoverRef.current = onHover;
  });

  // 차트 생성 — 테마가 바뀔 때만
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const c = {
      bg: token("--surface", "#ffffff"),
      fg: token("--fg-muted", "#56565d"),
      subtle: token("--fg-subtle", "#6d6d76"),
      grid: token("--border", "#e5e5e1"),
      up: token("--danger", "#b4231f"),
      down: token("--info", "#1f5fb8"),
      vwap: token("--warning", "#a35a05"),
      sma: token("--accent", "#0b7a56"),
      ok: token("--success", "#0b7a56"),
      warn: token("--warning", "#a35a05"),
    };
    colorsRef.current = c;

    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.fg, fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: alpha(c.grid, 0.6) }, horzLines: { color: alpha(c.grid, 0.6) } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: c.grid },
      timeScale: { borderColor: c.grid, timeVisible: true, secondsVisible: false, rightOffset: 3 },
      localization: { locale: "ko-KR", priceFormatter: (p: number) => formatNumber(p, 0) },
    });
    const line = (color: string, title: string) =>
      chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title,
      });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: c.up,
      downColor: c.down,
      wickUpColor: c.up,
      wickDownColor: c.down,
      borderVisible: false,
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const vwap = line(c.vwap, "VWAP");
    const sma = line(c.sma, "SMA20");
    const markers = createSeriesMarkers(candles, []);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        onHoverRef.current?.(null);
        return;
      }
      const t = param.time as number;
      const i = dataRef.current.bars.findIndex((b) => chartTime(b.t) === t);
      onHoverRef.current?.(i >= 0 ? i : null);
    });

    chartRef.current = chart;
    seriesRef.current = { candles, volume, vwap, sma, markers, priceLines: [] };
    fitted.current = null;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [theme]);

  // 데이터 반영 — 폴링마다 (사용자가 옮긴 확대·스크롤은 유지)
  useEffect(() => {
    const chart = chartRef.current;
    const s = seriesRef.current;
    if (!chart || !s) return;
    const c = colorsRef.current;

    s.candles.setData(
      data.bars.map((b) => ({ time: chartTime(b.t) as Time, open: Number(b.o), high: Number(b.h), low: Number(b.l), close: Number(b.c) }))
    );
    s.volume.setData(
      data.bars.map((b) => ({
        time: chartTime(b.t) as Time,
        value: Number(b.v),
        color: alpha(Number(b.c) >= Number(b.o) ? c.up : c.down, 0.35),
      }))
    );
    const linePts = (pick: (l: TraderChart["lines"][number]) => string | null) =>
      data.lines.flatMap((l) => {
        const v = num(pick(l));
        return v == null ? [] : [{ time: chartTime(l.t) as Time, value: v }];
      });
    s.vwap.setData(linePts((l) => l.vwap));
    s.sma.setData(linePts((l) => l.sma20));

    // 봉이 있는 시각에만 표시를 붙인다 (없는 시각에 붙이면 시간축이 어긋난다)
    const barTimes = new Set(data.bars.map((b) => chartTime(b.t) as number));
    const marks: SeriesMarker<Time>[] = [];
    for (const f of data.fills) {
      const t = chartTime(f.t);
      if (!barTimes.has(t)) continue;
      const buy = f.side === "BUY";
      marks.push({
        time: t as Time,
        position: buy ? "belowBar" : "aboveBar",
        shape: buy ? "arrowUp" : "arrowDown",
        color: buy ? c.up : c.down,
        text: `${buy ? "매수" : "매도"} ${formatNumber(Number(f.qty), 0)}`,
        size: 1,
      });
    }
    for (const sg of data.signals) {
      // 그림자 전략 신호는 너무 많아 차트에는 주문 전략 신호만 (전체는 점수 추이·판단 기록에서 본다)
      if (sg.shadow) continue;
      const t = chartTime(sg.t);
      if (!barTimes.has(t)) continue;
      marks.push({
        time: t as Time,
        position: sg.action === "BUY" ? "belowBar" : "aboveBar",
        shape: "circle",
        color: sg.riskResult === "APPROVED" ? c.ok : sg.riskResult === "REJECTED" ? c.warn : c.subtle,
        size: 0.6,
      });
    }
    marks.sort((a, b) => (a.time as number) - (b.time as number));
    s.markers.setMarkers(marks);

    for (const pl of s.priceLines) s.candles.removePriceLine(pl);
    s.priceLines = [];
    const p = data.position;
    if (p) {
      const add = (price: string | null, color: string, title: string, style: LineStyle) => {
        const v = num(price);
        if (v == null) return;
        s.priceLines.push(s.candles.createPriceLine({ price: v, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
      };
      add(p.avgPrice, c.fg, "평균단가", LineStyle.Dashed);
      add(p.stopLoss, c.down, "손절", LineStyle.Dotted);
      add(p.takeProfit, c.up, "목표", LineStyle.Dotted);
    }

    const key = `${data.symbol}:${data.interval}:${data.tradeDate}`;
    if (fitted.current !== key && data.bars.length > 0) {
      chart.timeScale().fitContent();
      fitted.current = key;
    }
  }, [data, theme]);

  return <div ref={ref} className={className} data-testid="trader-candle-chart" />;
}
