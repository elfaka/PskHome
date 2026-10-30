import { describe, it, expect } from "vitest";

import type { CandlePoint } from "@/api/stockSim";

import { previousClose } from "./candles";
import { changeTone, formatRate, formatSignedWon, formatWon, maxBuyable } from "./format";

describe("format", () => {
  it("formats won with thousands separators", () => {
    expect(formatWon(70000)).toBe("70,000원");
    expect(formatWon(1234.6)).toBe("1,235원");
  });

  it("adds a sign only to non-zero amounts", () => {
    expect(formatSignedWon(12000)).toBe("+12,000원");
    expect(formatSignedWon(-500)).toBe("-500원");
    expect(formatSignedWon(0)).toBe("0원");
  });

  it("formats rates as signed percentages", () => {
    expect(formatRate(0.0123)).toBe("+1.23%");
    expect(formatRate(-0.05)).toBe("-5.00%");
    expect(formatRate(0)).toBe("0.00%");
  });

  it("maps changes to up / down / flat", () => {
    expect(changeTone(100)).toBe("up");
    expect(changeTone(-1)).toBe("down");
    expect(changeTone(0)).toBe("flat");
    expect(changeTone(null)).toBe("flat");
  });

  it("computes the max buyable quantity", () => {
    expect(maxBuyable(10_000_000, 70_000)).toBe(142);
    expect(maxBuyable(10_000_000, null)).toBe(0);
  });
});

describe("previousClose", () => {
  const candle = (iso: string, close: number): CandlePoint => ({
    time: iso,
    open: close,
    high: close,
    low: close,
    close,
    volume: 0,
  });

  // KST 기준 10/28(수), 10/29(목), 10/30(금) 일봉
  const candles = [
    candle("2026-10-27T15:00:00.000Z", 100),
    candle("2026-10-28T15:00:00.000Z", 110),
    candle("2026-10-29T15:00:00.000Z", 120),
  ];

  it("uses the last candle before the quote's KST date", () => {
    // 금요일 장중 현재가 → 전일(목) 종가
    expect(previousClose(candles, "2026-10-30T03:00:00.000Z")).toBe(110);
  });

  it("keeps Friday's comparison over the weekend", () => {
    // 토요일에 봐도 현재가 시각은 금요일 장 마감이다.
    expect(previousClose(candles, "2026-10-30T06:30:00.000Z", new Date("2026-10-31T03:00:00.000Z"))).toBe(110);
  });

  it("returns null without an earlier candle", () => {
    expect(previousClose(candles.slice(0, 1), "2026-10-27T16:00:00.000Z")).toBeNull();
  });
});
