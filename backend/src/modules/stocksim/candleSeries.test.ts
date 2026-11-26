import { afterEach, describe, expect, it, vi } from "vitest";

import { CandleSeries, fetchAllCandles, mergeLatest, type CandlePage, type FetchCandlePage } from "./candleSeries.js";
import type { CandlePoint } from "./stockSim.types.js";

const T0 = Date.parse("2026-11-24T01:00:00.000Z"); // 10:00 KST

const bar = (minute: number, close = 100 + minute): CandlePoint => ({
  time: new Date(T0 + minute * 60_000).toISOString(),
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
});

/** 토스처럼 최신순 페이지로 돌려주는 가짜 캔들 원천. `bars` 를 바꾸면 다음 조회부터 반영된다 */
function source(initial: CandlePoint[]) {
  const state = { bars: initial, calls: [] as { count: number; before?: string }[] };
  const fetchPage: FetchCandlePage = async (count, before) => {
    state.calls.push({ count, before });
    const newest = [...state.bars].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
    const start = before ? newest.findIndex((c) => Date.parse(c.time) <= Date.parse(before)) : 0;
    const page = start < 0 ? [] : newest.slice(start, start + count);
    const next = newest[start + count];
    return { candles: page, nextBefore: start >= 0 && next ? next.time : null } satisfies CandlePage;
  };
  return { state, fetchPage };
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => bar(from + i));

describe("fetchAllCandles", () => {
  it("pages back 200 at a time and returns oldest first", async () => {
    const { state, fetchPage } = source(range(0, 449));

    const candles = await fetchAllCandles(fetchPage, 450);

    expect(state.calls.map((c) => c.count)).toEqual([200, 200, 50]);
    expect(candles).toHaveLength(450);
    expect(candles[0]).toEqual(bar(0));
    expect(candles[449]).toEqual(bar(449));
  });
});

describe("mergeLatest", () => {
  it("appends new bars and overwrites the bar still in progress", () => {
    const merged = mergeLatest(range(0, 9), [bar(9, 999), bar(10), bar(11)], 100);

    expect(merged?.map((c) => c.close)).toEqual([...range(0, 8).map((c) => c.close), 999, 110, 111]);
  });

  it("drops the oldest bars beyond the count", () => {
    const merged = mergeLatest(range(0, 9), range(8, 12), 10);

    expect(merged).toEqual(range(3, 12));
  });

  it("returns null when the latest page does not reach the bars we have (a gap)", () => {
    expect(mergeLatest(range(0, 9), range(11, 15), 100)).toBeNull();
  });

  it("keeps what we have when the latest page is empty", () => {
    const prev = range(0, 9);
    expect(mergeLatest(prev, [], 100)).toBe(prev);
  });

  it("matches the same moment written with a different offset", () => {
    const kst = { ...bar(9, 555), time: "2026-11-24T10:09:00+09:00" };

    const merged = mergeLatest(range(0, 9), [kst], 100);

    expect(merged).toHaveLength(10);
    expect(merged?.[9].close).toBe(555);
  });
});

describe("CandleSeries", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches everything once, then only the newest page on each refresh", async () => {
    const series = new CandleSeries(0); // 매번 만료
    const { state, fetchPage } = source(range(0, 599));

    expect(await series.get("KOSPI", 600, fetchPage)).toHaveLength(600);
    expect(state.calls).toHaveLength(3);

    state.bars = [...range(0, 598), bar(599, 7_000), bar(600)];
    const refreshed = await series.get("KOSPI", 600, fetchPage);

    expect(state.calls).toHaveLength(4);
    expect(state.calls[3]).toEqual({ count: 200, before: undefined });
    expect(refreshed).toHaveLength(600);
    expect(refreshed[0]).toEqual(bar(1));
    expect(refreshed.at(-2)?.close).toBe(7_000);
    expect(refreshed.at(-1)).toEqual(bar(600));
  });

  it("does not call again while the cache is fresh", async () => {
    const series = new CandleSeries(60_000);
    const { state, fetchPage } = source(range(0, 9));

    await series.get("A", 10, fetchPage);
    await series.get("A", 10, fetchPage);

    expect(state.calls).toHaveLength(1);
  });

  it("fetches everything again when the newest page does not connect", async () => {
    const series = new CandleSeries(0);
    const { state, fetchPage } = source(range(0, 9));
    await series.get("A", 10, fetchPage);

    // 마지막으로 받은 뒤 10개보다 많이 쌓였다 (최신 페이지 10개가 이전 마지막 봉까지 닿지 않는다).
    state.bars = range(0, 30);
    const candles = await series.get("A", 10, fetchPage);

    expect(state.calls.map((c) => c.before === undefined)).toEqual([true, true, true]);
    expect(candles).toEqual(range(21, 30));
  });

  it("fetches everything again once the KST date changes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T14:00:00+09:00"));
    const series = new CandleSeries(0);
    const { state, fetchPage } = source(range(0, 399));
    await series.get("A", 400, fetchPage);
    expect(state.calls).toHaveLength(2);

    vi.setSystemTime(new Date("2026-11-25T09:00:00+09:00"));
    await series.get("A", 400, fetchPage);

    expect(state.calls).toHaveLength(4);
  });

  it("keeps separate series per key and forgets everything on clear", async () => {
    const series = new CandleSeries(60_000);
    const a = source(range(0, 4));
    const b = source(range(10, 14));

    expect((await series.get("A", 5, a.fetchPage))[0]).toEqual(bar(0));
    expect((await series.get("B", 5, b.fetchPage))[0]).toEqual(bar(10));

    series.clear();
    await series.get("A", 5, a.fetchPage);
    expect(a.state.calls).toHaveLength(2);
  });
});
