import { describe, it, expect } from "vitest";

import { aggregateCandles, bollinger, ema, macd, maxDrawdown, rsi, sma } from "./indicators.js";
import type { CandlePoint } from "./stockSim.types.js";

describe("sma", () => {
  it("averages the last n values and leaves the warm-up as null", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
});

describe("ema", () => {
  it("seeds with the simple average then smooths", () => {
    const out = ema([1, 2, 3, 4], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBe(2);
    expect(out[3]).toBe(4 * 0.5 + 2 * 0.5); // k = 2/(3+1)
  });
});

describe("rsi", () => {
  it("is 100 when prices only rise", () => {
    const values = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(rsi(values, 14).at(-1)).toBe(100);
  });

  it("is 0 when prices only fall", () => {
    const values = Array.from({ length: 20 }, (_, i) => 100 - i);
    expect(rsi(values, 14).at(-1)).toBe(0);
  });

  it("is 50 for equal ups and downs", () => {
    const values = Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 100 : 101));
    expect(rsi(values, 14)[14]).toBeCloseTo(50);
  });

  it("needs more than `period` values", () => {
    expect(rsi([1, 2, 3], 14)).toEqual([null, null, null]);
  });
});

describe("macd", () => {
  it("is positive in an uptrend and the histogram is macd - signal", () => {
    const values = Array.from({ length: 60 }, (_, i) => 100 + i * i * 0.1);
    const last = macd(values).at(-1)!;

    expect(last.macd).toBeGreaterThan(0);
    expect(last.histogram).toBeCloseTo((last.macd as number) - (last.signal as number));
  });

  it("starts the signal once 26 + 9 - 1 values exist", () => {
    const out = macd(Array.from({ length: 40 }, (_, i) => i));
    expect(out[24].macd).toBeNull();
    expect(out[25].macd).not.toBeNull();
    expect(out[32].signal).toBeNull();
    expect(out[33].signal).not.toBeNull();
  });
});

describe("bollinger", () => {
  it("collapses to the mean for a flat series", () => {
    const last = bollinger(Array(20).fill(50)).at(-1)!;
    expect(last).toEqual({ middle: 50, upper: 50, lower: 50 });
  });

  it("uses the population standard deviation", () => {
    const values = [...Array(10).fill(9), ...Array(10).fill(11)];
    const last = bollinger(values, 20, 2).at(-1)!;
    expect(last.middle).toBe(10);
    expect(last.upper).toBe(12);
    expect(last.lower).toBe(8);
  });
});

describe("maxDrawdown", () => {
  it("returns the largest peak-to-trough fall", () => {
    expect(maxDrawdown([100, 120, 90, 110, 60, 130])).toBe(0.5);
    expect(maxDrawdown([1, 2, 3])).toBe(0);
  });
});

describe("aggregateCandles", () => {
  const bar = (time: string, open: number, high: number, low: number, close: number): CandlePoint => ({
    time,
    open,
    high,
    low,
    close,
    volume: 10,
  });

  it("groups daily bars into Monday-based weeks in KST", () => {
    const days = [
      bar("2026-10-25T15:00:00.000Z", 10, 12, 9, 11), // 10/26 월
      bar("2026-10-29T15:00:00.000Z", 11, 15, 8, 14), // 10/30 금
      bar("2026-11-01T15:00:00.000Z", 14, 16, 13, 15), // 11/02 월 (다음 주)
    ];

    const weeks = aggregateCandles(days, "1w");

    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ open: 10, high: 15, low: 8, close: 14, volume: 20 });
    expect(weeks[1]).toMatchObject({ open: 14, close: 15, volume: 10 });
  });

  it("groups by KST month", () => {
    const days = [
      bar("2026-10-29T15:00:00.000Z", 1, 1, 1, 1), // 10/30
      bar("2026-10-30T15:00:00.000Z", 2, 2, 2, 2), // 10/31
      bar("2026-10-31T15:00:00.000Z", 3, 3, 3, 3), // 11/01 (KST)
    ];

    expect(aggregateCandles(days, "1M").map((c) => c.close)).toEqual([2, 3]);
  });

  it("buckets minute bars", () => {
    const minutes = Array.from({ length: 12 }, (_, i) =>
      bar(new Date(Date.UTC(2026, 9, 30, 0, i)).toISOString(), i, i, i, i)
    );

    const fives = aggregateCandles(minutes, "5m");

    expect(fives.map((c) => [c.open, c.close])).toEqual([
      [0, 4],
      [5, 9],
      [10, 11],
    ]);
  });
});
