import { describe, expect, it } from "vitest";

import { cumulative, flowTurn } from "./flowTrend";

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
