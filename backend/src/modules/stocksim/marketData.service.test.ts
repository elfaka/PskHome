import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeTossClient, type FakeTossClient } from "../../testing/fakeTossClient.js";

const holder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("./toss/tossClient.js", () => ({ getTossClient: () => holder.client }));

const { getChart, getPriceLimits, getQuote, getQuotes, getQuotesWithChange, resetMarketDataCache } = await import(
  "./marketData.service.js"
);

/** 토스 호출 중 이 메서드만 */
const callsOf = (toss: FakeTossClient, method: keyof FakeTossClient) => toss.calls.filter((c) => c.method === method);

describe("marketData — 토스 호출 줄이기", () => {
  let toss: FakeTossClient;

  beforeEach(() => {
    toss = createFakeTossClient();
    holder.client = toss;
    resetMarketDataCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getQuotes", () => {
    it("joins a request already loading the same symbol instead of calling again", async () => {
      const [a, b] = await Promise.all([getQuotes(["005930", "000660"]), getQuote("005930")]);

      expect(callsOf(toss, "getPrices")).toHaveLength(1);
      expect(a.map((q) => q.price)).toEqual([70_000, 200_000]);
      expect(b.price).toBe(70_000);
    });

    it("only asks Toss for the symbols nobody is loading yet", async () => {
      await Promise.all([getQuote("005930"), getQuotes(["005930", "AAPL"])]);

      expect(callsOf(toss, "getPrices").map((c) => c.args[0])).toEqual([["005930"], ["AAPL"]]);
    });

    it("brings along other symbols asked for recently, so the next poll needs no call", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-30T15:00:00+09:00"));
      await getQuote("005930"); // 시세 개요
      vi.setSystemTime(new Date("2026-10-30T15:00:02+09:00"));
      await getQuotes(["000660", "005930"]); // 관심종목 줄 — 2초 지난 005930 도 같이 받는다
      vi.setSystemTime(new Date("2026-10-30T15:00:05.500+09:00"));
      await getQuote("005930"); // 다음 시세 개요 폴링 — 000660 도 같이 받는다
      vi.setSystemTime(new Date("2026-10-30T15:00:07+09:00"));
      await getQuotes(["000660", "005930"]); // 다음 관심종목 폴링은 토스를 부르지 않는다
      vi.setSystemTime(new Date("2026-10-30T15:00:10.500+09:00"));
      await getQuote("005930");
      vi.setSystemTime(new Date("2026-10-30T15:00:12+09:00"));
      await getQuotes(["000660", "005930"]);

      // 두 폴링이 5초마다 한 번씩(10초에 4번) 물어도, 처음 한 번 뒤로는 5초에 1회만 부른다.
      expect(callsOf(toss, "getPrices").map((c) => c.args[0])).toEqual([
        ["005930"],
        ["000660", "005930"],
        ["005930", "000660"],
        ["005930", "000660"],
      ]);
    });

    it("stops bringing along symbols nobody asked for in the last 15 seconds", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-30T15:00:00+09:00"));
      await getQuote("000660");
      vi.setSystemTime(new Date("2026-10-30T15:00:20+09:00"));
      await getQuote("005930");

      expect(callsOf(toss, "getPrices").at(-1)?.args[0]).toEqual(["005930"]);
    });

    it("fails every request that waited on a failed call, and retries next time", async () => {
      const real = toss.getPrices;
      toss.getPrices = async () => {
        throw new Error("boom");
      };

      const results = await Promise.allSettled([getQuote("005930"), getQuote("005930")]);
      expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);

      toss.getPrices = real;
      expect((await getQuote("005930")).price).toBe(70_000);
    });
  });

  describe("getQuotesWithChange", () => {
    it("fetches the previous close once per quote date, not on every refresh", async () => {
      await getQuotesWithChange(["005930", "000660"]);
      skipQuoteCache();
      const again = await getQuotesWithChange(["005930", "000660"]);

      expect(callsOf(toss, "getCandles")).toHaveLength(2);
      expect(again[0].prevClose).not.toBeNull();
    });

    it("fetches the previous close again when the quote date moves on", async () => {
      await getQuotesWithChange(["005930"]);

      const real = toss.getPrices;
      toss.getPrices = async (symbols) =>
        (await real(symbols)).map((p) => ({ ...p, timestamp: "2026-11-02T00:30:00.000Z" }));
      skipQuoteCache();
      await getQuotesWithChange(["005930"]);

      expect(callsOf(toss, "getCandles")).toHaveLength(2);
    });
  });

  describe("getPriceLimits", () => {
    it("reuses the day's price limits", async () => {
      await getPriceLimits("005930");
      await getPriceLimits("005930");

      expect(callsOf(toss, "getPriceLimits")).toHaveLength(1);
    });
  });

  describe("getChart", () => {
    it("keeps the minute candles and only fetches the newest page once the cache expires", async () => {
      toss.minuteCount = 1_000;
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-30T15:30:00+09:00"));
      expect((await getChart("005930", "1m")).candles).toHaveLength(1_000);
      expect(callsOf(toss, "getCandles")).toHaveLength(5);

      vi.setSystemTime(new Date("2026-10-30T15:31:00+09:00"));
      expect((await getChart("005930", "1m")).candles).toHaveLength(1_000);
      expect(callsOf(toss, "getCandles")).toHaveLength(6);
      expect(callsOf(toss, "getCandles")[5].args).toEqual(["005930", "1m", 200, undefined]);
    });
  });
});

/** 현재가 캐시(3초)만 지나가도록 시계를 4초 옮긴다. 다른 캐시는 아직 살아 있다 */
function skipQuoteCache() {
  const now = Date.now();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now + 4_000);
}
