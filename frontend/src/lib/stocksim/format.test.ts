import { describe, it, expect } from "vitest";

import {
  changeTone,
  formatKrwCompact,
  formatPercent,
  formatRate,
  formatShares,
  formatSignedWon,
  formatWon,
  maxBuyable,
} from "./format";

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

describe("large number formats", () => {
  it("formats market caps in 조·억", () => {
    expect(formatKrwCompact(1_297_873_850_976_000)).toBe("1,297조 8,738억");
    expect(formatKrwCompact(5_000_000_000_000)).toBe("5조");
    expect(formatKrwCompact(123_400_000_000)).toBe("1,234억");
    expect(formatKrwCompact(-250_000_000)).toBe("-2억");
  });

  it("formats share counts in 만·억", () => {
    expect(formatShares(29_363_972)).toBe("2,936만");
    expect(formatShares(-17_791_243)).toBe("-1,779만");
    expect(formatShares(250_000_000)).toBe("2.50억");
    expect(formatShares(950)).toBe("950");
  });

  it("formats unsigned percentages", () => {
    expect(formatPercent(0.1036)).toBe("10.36%");
  });
});
