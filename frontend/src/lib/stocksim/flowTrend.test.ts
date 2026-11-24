import { describe, expect, it } from "vitest";

import { cumulative, flowConsensus, flowTurn, recentDirection } from "./flowTrend";

describe("flowTrend", () => {
  it("accumulates from the oldest value", () => {
    expect(cumulative([100, -30, 50])).toEqual([100, 70, 120]);
  });

  it("says the flow keeps rising when the last value is the highest", () => {
    expect(flowTurn([-50, 10, 40, 90])).toEqual({ kind: "high", index: 0, change: 140 });
  });

  it("finds the peak the flow turned down from", () => {
    expect(flowTurn([10, 80, 120, 90, 100])).toEqual({ kind: "belowPeak", index: 2, change: -20 });
  });

  it("says the flow keeps falling when the last value is the lowest", () => {
    expect(flowTurn([30, 60, 20, -40])).toEqual({ kind: "low", index: 1, change: -100 });
  });

  it("returns null without enough data or movement", () => {
    expect(flowTurn([5])).toBeNull();
    expect(flowTurn([7, 7, 7])).toBeNull();
  });
});

describe("flowConsensus / recentDirection", () => {
  it("calls it a two-way buy or sell only when both point the same way", () => {
    expect(flowConsensus(100, 5)).toBe("bothBuy");
    expect(flowConsensus(-100, -5)).toBe("bothSell");
    expect(flowConsensus(100, -5)).toBe("mixed");
    expect(flowConsensus(0, 5)).toBe("mixed");
  });

  it("compares the last two records", () => {
    expect(recentDirection([10, 30, 20])).toBe("down");
    expect(recentDirection([10, 30])).toBe("up");
    expect(recentDirection([30, 30])).toBe("flat");
    expect(recentDirection([30])).toBeNull();
  });
});
