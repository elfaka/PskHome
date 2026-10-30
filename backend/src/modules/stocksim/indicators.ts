import type { CandlePoint } from "./stockSim.types.js";

/**
 * 기술적 지표 계산 — 모두 순수 함수다.
 *
 * 입력 배열은 **오래된 것부터** 정렬돼 있다고 가정하고, 결과도 입력과 같은 길이로 돌려준다.
 * 계산에 필요한 데이터가 모자란 앞부분은 null 이다 (차트에 그대로 겹쳐 그리기 쉽도록).
 */

/** 단순이동평균 */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;

  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }

  return out;
}

/** 지수이동평균. 첫 값은 처음 period 개의 단순평균으로 시작한다. */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (prev == null) {
      prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }

  return out;
}

/** RSI — Wilder 평활. 하락폭이 0 이면 100. */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = values.map(() => null);
  if (values.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;

  const value = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  out[period] = value();

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(diff, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-diff, 0)) / period;
    out[i] = value();
  }

  return out;
}

export interface MacdPoint {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}

/** MACD(12, 26, 9) */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdPoint[] {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const line = values.map((_, i) =>
    fastEma[i] != null && slowEma[i] != null ? (fastEma[i] as number) - (slowEma[i] as number) : null
  );

  // 시그널은 MACD 값이 생긴 지점부터의 EMA 다.
  const start = line.findIndex((v) => v != null);
  const signal: (number | null)[] = values.map(() => null);
  if (start >= 0) {
    const tail = ema(line.slice(start) as number[], signalPeriod);
    tail.forEach((v, i) => (signal[start + i] = v));
  }

  return line.map((m, i) => ({
    macd: m,
    signal: signal[i],
    histogram: m != null && signal[i] != null ? m - (signal[i] as number) : null,
  }));
}

export interface BollingerPoint {
  middle: number | null;
  upper: number | null;
  lower: number | null;
}

/** 볼린저밴드 (모표준편차) */
export function bollinger(values: number[], period = 20, width = 2): BollingerPoint[] {
  const middle = sma(values, period);

  return values.map((_, i) => {
    const m = middle[i];
    if (m == null) return { middle: null, upper: null, lower: null };

    const window = values.slice(i - period + 1, i + 1);
    const sd = Math.sqrt(window.reduce((s, v) => s + (v - m) ** 2, 0) / period);
    return { middle: m, upper: m + width * sd, lower: m - width * sd };
  });
}

/** 최대 낙폭 (0.25 = 고점 대비 25% 하락). 음수가 아니라 양수 비율로 돌려준다. */
export function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let worst = 0;

  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak > 0) worst = Math.max(worst, (peak - v) / peak);
  }

  return worst;
}

/** 마지막 값 (null 제외) */
export function last<T>(values: (T | null)[], offset = 0): T | null {
  const v = values[values.length - 1 - offset];
  return v ?? null;
}

/** KST 날짜 문자열 "2026-10-30" */
export function kstDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

export type AggregateUnit = "5m" | "15m" | "1w" | "1M";

/**
 * 봉을 더 큰 단위로 묶는다 (1분봉 → 5·15분봉, 일봉 → 주봉·월봉).
 * 분은 시각을 단위로 내림 (KST 는 UTC+9 정시라 UTC 기준으로 잘라도 같다).
 * 주는 KST 월요일 시작, 월은 KST 같은 달. 시가=첫 봉, 종가=마지막 봉, 고가·저가=극값, 거래량=합.
 * 묶음의 시각은 첫 봉의 시각이다.
 */
export function aggregateCandles(points: CandlePoint[], unit: AggregateUnit): CandlePoint[] {
  const keyOf = (iso: string): string => {
    if (unit === "5m" || unit === "15m") {
      const size = (unit === "5m" ? 5 : 15) * 60_000;
      return String(Math.floor(new Date(iso).getTime() / size));
    }

    const date = kstDate(iso);
    if (unit === "1M") return date.slice(0, 7);

    const d = new Date(`${date}T00:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7; // 월=0
    d.setUTCDate(d.getUTCDate() - dow);
    return d.toISOString().slice(0, 10);
  };

  const out: CandlePoint[] = [];
  let currentKey: string | null = null;

  for (const p of points) {
    const key = keyOf(p.time);
    const bar = out[out.length - 1];

    if (key !== currentKey || !bar) {
      out.push({ ...p });
      currentKey = key;
      continue;
    }

    bar.high = Math.max(bar.high, p.high);
    bar.low = Math.min(bar.low, p.low);
    bar.close = p.close;
    bar.volume += p.volume;
  }

  return out;
}
