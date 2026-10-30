"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

import type { ChartData, Timeframe } from "@/api/stockSim";
import { kstDate } from "@/lib/stocksim/candles";
import { formatNumber } from "@/lib/stocksim/format";

/**
 * TradingView lightweight-charts 로 그리는 캔들 차트 (canvas).
 *
 * - 위 패널: 캔들 + 거래량 + 이동평균(5·20·60·120) + 볼린저밴드
 * - 아래 패널: RSI(14), MACD(12,26,9) — 켜고 끌 수 있다
 * - 색은 CSS 토큰(--danger 상승, --info 하락 ...)을 읽어 쓴다. canvas 라 클래스를 못 쓰기 때문이다.
 *
 * 차트 객체는 테마·패널 구성·봉 단위가 바뀔 때만 다시 만들고,
 * 폴링으로 데이터만 바뀌면 setData 로 갈아 끼워 사용자가 옮겨 둔 확대·스크롤을 유지한다.
 */

export type ChartToggles = {
  ma: boolean;
  bollinger: boolean;
  volume: boolean;
  rsi: boolean;
  macd: boolean;
};

/** 십자선이 가리키는 봉 — 범례에 쓴다 */
export type HoverBar = { index: number };

const INTRADAY: Timeframe[] = ["1m", "5m", "15m"];
const KST_OFFSET_S = 9 * 3600;
/** 봉 단위별로 처음 보여줄 봉 수 */
const INITIAL_BARS: Record<Timeframe, number> = { "1m": 240, "5m": 160, "15m": 120, "1d": 120, "1w": 104, "1M": 60 };

/**
 * lightweight-charts 는 시간을 UTC 로 표시한다. 한국 시간으로 보이도록 9시간을 더한 값을 넘긴다.
 * 일봉 이상은 KST 날짜의 자정으로 맞춰 날짜가 하루 밀리지 않게 한다.
 */
export function toChartTime(iso: string, timeframe: Timeframe): UTCTimestamp {
  if (INTRADAY.includes(timeframe)) {
    return (Math.floor(Date.parse(iso) / 1000) + KST_OFFSET_S) as UTCTimestamp;
  }
  return (Date.parse(`${kstDate(iso)}T00:00:00Z`) / 1000) as UTCTimestamp;
}

function token(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** "#rrggbb" + 투명도 → "#rrggbbaa" */
function alpha(hex: string, a: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
}

type SeriesSet = {
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram"> | null;
  ma: ISeriesApi<"Line">[];
  bbUpper: ISeriesApi<"Line"> | null;
  bbLower: ISeriesApi<"Line"> | null;
  rsi: ISeriesApi<"Line"> | null;
  macdHist: ISeriesApi<"Histogram"> | null;
  macdLine: ISeriesApi<"Line"> | null;
  macdSignal: ISeriesApi<"Line"> | null;
};

function points(times: Time[], values: (number | null)[]) {
  return values.flatMap((v, i) => (v == null ? [] : [{ time: times[i], value: v }]));
}

export default function CandleChart({
  data,
  toggles,
  theme,
  livePrice,
  liveTime,
  onHover,
  className,
  digits = 0,
}: {
  data: ChartData;
  toggles: ChartToggles;
  theme: "light" | "dark";
  livePrice: number | null;
  /** 현재가 시각 (ISO) */
  liveTime: string | null;
  onHover: (bar: HoverBar | null) => void;
  className?: string;
  /** 가격 축 소수 자릿수 (주가 0, 지수 2) */
  digits?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<SeriesSet | null>(null);
  const colorsRef = useRef({ up: "", down: "" });
  const dataRef = useRef(data);
  const onHoverRef = useRef(onHover);
  /** 마지막으로 범위를 맞춘 봉 단위 — 바뀌었을 때만 처음 보이는 범위를 다시 잡는다 */
  const fittedRef = useRef<string | null>(null);

  useEffect(() => {
    dataRef.current = data;
    onHoverRef.current = onHover;
  });

  const { timeframe } = data;

  // --- 차트 생성 (테마·패널 구성·봉 단위가 바뀔 때) ---------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const c = {
      bg: token("--surface", "#ffffff"),
      fg: token("--fg-muted", "#56565d"),
      grid: token("--border", "#e5e5e1"),
      up: token("--danger", "#b4231f"),
      down: token("--info", "#1f5fb8"),
      ma: [token("--warning", "#a35a05"), token("--accent", "#0b7a56"), token("--fg", "#18181b"), token("--fg-subtle", "#6d6d76")],
      band: token("--fg-subtle", "#6d6d76"),
    };
    colorsRef.current = { up: c.up, down: c.down };
    const intraday = INTRADAY.includes(timeframe);

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: c.bg },
        textColor: c.fg,
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: c.grid, separatorHoverColor: c.grid },
      },
      grid: { vertLines: { color: alpha(c.grid, 0.6) }, horzLines: { color: alpha(c.grid, 0.6) } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: c.grid },
      timeScale: { borderColor: c.grid, timeVisible: intraday, secondsVisible: false, rightOffset: 4 },
      localization: { locale: "ko-KR", priceFormatter: (p: number) => formatNumber(p, digits) },
    });

    const line = (color: string, paneIndex = 0, style = LineStyle.Solid) =>
      chart.addSeries(
        LineSeries,
        {
          color,
          lineWidth: 1,
          lineStyle: style,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        paneIndex
      );

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: c.up,
      downColor: c.down,
      wickUpColor: c.up,
      wickDownColor: c.down,
      borderVisible: false,
    });

    let volume: ISeriesApi<"Histogram"> | null = null;
    if (toggles.volume) {
      volume = chart.addSeries(HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
      });
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    }

    const ma = toggles.ma ? c.ma.map((color) => line(color)) : [];
    const bbUpper = toggles.bollinger ? line(c.band, 0, LineStyle.Dotted) : null;
    const bbLower = toggles.bollinger ? line(c.band, 0, LineStyle.Dotted) : null;

    let pane = 1;
    let rsiSeries: ISeriesApi<"Line"> | null = null;
    if (toggles.rsi) {
      rsiSeries = line(c.ma[0], pane);
      rsiSeries.applyOptions({ lastValueVisible: true, title: "RSI" });
      rsiSeries.createPriceLine({ price: 70, color: c.up, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "" });
      rsiSeries.createPriceLine({ price: 30, color: c.down, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "" });
      pane++;
    }

    let macdHist: ISeriesApi<"Histogram"> | null = null;
    let macdLine: ISeriesApi<"Line"> | null = null;
    let macdSignal: ISeriesApi<"Line"> | null = null;
    if (toggles.macd) {
      macdHist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
      macdLine = line(c.ma[2], pane);
      macdSignal = line(c.ma[0], pane);
      pane++;
    }

    // 위 패널을 아래 지표 패널보다 크게
    chart.panes().forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        onHoverRef.current(null);
        return;
      }
      const t = param.time as number;
      const index = dataRef.current.candles.findIndex((bar) => toChartTime(bar.time, dataRef.current.timeframe) === t);
      onHoverRef.current(index >= 0 ? { index } : null);
    });

    chartRef.current = chart;
    seriesRef.current = { candles, volume, ma, bbUpper, bbLower, rsi: rsiSeries, macdHist, macdLine, macdSignal };
    fittedRef.current = null;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [theme, timeframe, digits, toggles.ma, toggles.bollinger, toggles.volume, toggles.rsi, toggles.macd]);

  // --- 데이터 반영 (폴링마다) --------------------------------------------------------
  useEffect(() => {
    const chart = chartRef.current;
    const s = seriesRef.current;
    if (!chart || !s) return;

    const { up, down } = colorsRef.current;
    const times = data.candles.map((bar) => toChartTime(bar.time, data.timeframe) as Time);
    const ind = data.indicators;

    s.candles.setData(
      data.candles.map((bar, i) => ({ time: times[i], open: bar.open, high: bar.high, low: bar.low, close: bar.close }))
    );
    s.volume?.setData(
      data.candles.map((bar, i) => ({
        time: times[i],
        value: bar.volume,
        color: alpha(bar.close >= bar.open ? up : down, 0.4),
      }))
    );
    [ind.ma5, ind.ma20, ind.ma60, ind.ma120].forEach((values, i) => s.ma[i]?.setData(points(times, values)));
    s.bbUpper?.setData(points(times, ind.bollinger.map((b) => b.upper)));
    s.bbLower?.setData(points(times, ind.bollinger.map((b) => b.lower)));
    s.rsi?.setData(points(times, ind.rsi));
    s.macdLine?.setData(points(times, ind.macd.map((m) => m.macd)));
    s.macdSignal?.setData(points(times, ind.macd.map((m) => m.signal)));
    s.macdHist?.setData(
      ind.macd.flatMap((m, i) =>
        m.histogram == null ? [] : [{ time: times[i], value: m.histogram, color: alpha(m.histogram >= 0 ? up : down, 0.6) }]
      )
    );

    const fitKey = `${data.symbol}:${data.timeframe}`;
    if (fittedRef.current !== fitKey && times.length > 0) {
      const visible = INITIAL_BARS[data.timeframe];
      const range: LogicalRange = { from: Math.max(0, times.length - visible), to: times.length + 3 } as LogicalRange;
      chart.timeScale().setVisibleLogicalRange(range);
      fittedRef.current = fitKey;
    }
  }, [data, theme, toggles.ma, toggles.bollinger, toggles.volume, toggles.rsi, toggles.macd]);

  // --- 실시간 현재가로 마지막 봉 갱신 -------------------------------------------------
  // 분봉은 봉이 1분마다 새로 생겨 현재가를 붙일 봉이 애매하므로 폴링 데이터만 쓴다.
  // 일봉은 현재가와 같은 날의 봉, 주·월봉은 현재가가 마지막 봉 기간 안일 때만 갱신한다.
  useEffect(() => {
    const s = seriesRef.current;
    const lastBar = data.candles[data.candles.length - 1];
    if (!s || !lastBar || livePrice == null || liveTime == null) return;
    if (INTRADAY.includes(data.timeframe)) return;
    if (data.timeframe === "1d" && kstDate(lastBar.time) !== kstDate(liveTime)) return;
    if (kstDate(liveTime) < kstDate(lastBar.time)) return;

    s.candles.update({
      time: toChartTime(lastBar.time, data.timeframe) as Time,
      open: lastBar.open,
      high: Math.max(lastBar.high, livePrice),
      low: Math.min(lastBar.low, livePrice),
      close: livePrice,
    });
  }, [livePrice, liveTime, data]);

  return <div ref={containerRef} className={className} data-testid="candle-chart" />;
}
