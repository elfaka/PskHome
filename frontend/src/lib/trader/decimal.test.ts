import { describe, expect, it } from "vitest";

import { cmpDec, formatDec, formatKst, formatRatioPct, signOf } from "./decimal";

describe("trader decimal formatting (string-only)", () => {
  it("groups thousands and rounds half up", () => {
    expect(formatDec("9124526.0000")).toBe("9,124,526");
    expect(formatDec("1234.5")).toBe("1,235");
    expect(formatDec("999.995", 2)).toBe("1,000.00");
    expect(formatDec("-105926.4999")).toBe("-105,926");
    expect(formatDec("13.000000")).toBe("13");
    expect(formatDec("0.0000", 0, true)).toBe("0");
    expect(formatDec("105926.0000", 0, true)).toBe("+105,926");
    expect(formatDec(null)).toBe("—");
  });

  it("keeps precision beyond float range", () => {
    expect(formatDec("12345678901234567890.5")).toBe("12,345,678,901,234,567,891");
  });

  it("formats ratios as percent without floats", () => {
    expect(formatRatioPct("0.012345")).toBe("+1.23%");
    expect(formatRatioPct("-0.0005")).toBe("-0.05%");
    expect(formatRatioPct("0")).toBe("0.00%");
    expect(formatRatioPct("0.5", 0, false)).toBe("50%");
  });

  it("detects sign", () => {
    expect(signOf("1.0")).toBe("up");
    expect(signOf("-0.01")).toBe("down");
    expect(signOf("0.0000")).toBe("flat");
    expect(signOf(null)).toBe("flat");
  });

  it("shows KST time", () => {
    expect(formatKst("2026-11-26T00:30:00.000Z")).toContain("09:30:00");
  });

  it("compares decimal strings without floats", () => {
    expect(cmpDec("70.0000", "70")).toBe(0);
    expect(cmpDec("69.9999", "70")).toBe(-1);
    expect(cmpDec("100", "70")).toBe(1);
    expect(cmpDec("1.5370", "1.5")).toBe(1);
    expect(cmpDec("-0.0000", "0")).toBe(0);
    expect(cmpDec("-438.0150", "0")).toBe(-1);
    expect(cmpDec("-2", "-10")).toBe(1);
    expect(cmpDec("12345678901234567890.1", "12345678901234567890.09")).toBe(1);
    expect(cmpDec(null, "1")).toBeNull();
    expect(cmpDec("abc", "1")).toBeNull();
  });
});
