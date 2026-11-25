import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

import { createFakeTossClient, type FakeTossClient } from "../../testing/fakeTossClient.js";
import type { TossInvestorTradingRecord } from "./toss/toss.types.js";

/**
 * 투자자 동향 확장 — 장중 스냅샷 쌓기 규칙은 직접, 순위 응답은 fake 토스로 라우트까지 검증한다.
 */
const holder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("./toss/tossClient.js", () => ({ getTossClient: () => holder.client }));
vi.mock("./dart/dartClient.js", () => ({ getDartClient: () => null }));

const { createApp } = await import("../../app.js");
const { resetMarketDataCache } = await import("./marketData.service.js");
const {
  getIntradayFlows,
  isMarketHours,
  rankingThrottle,
  samplerThrottle,
  recordSnapshot,
  resetInvestorFlowState,
  sampleTrackedSymbols,
  trackedSymbols,
} = await import("./investorFlow.service.js");

const app = createApp();

/** KST 시각 → Date */
const kst = (date: string, time: string) => new Date(`${date}T${time}:00+09:00`);

function record(date: string, updatedAt: string, foreigner: number, institution: number): TossInvestorTradingRecord {
  const vol = (net: number) => ({ buyVolume: "0", sellVolume: "0", netBuyVolume: String(net) });
  return {
    date,
    updatedAt,
    individual: null,
    foreigner: vol(foreigner),
    institution: vol(institution),
    otherCorporation: null,
    foreignerHolding: null,
  };
}

describe("investor flow extensions", () => {
  let toss: FakeTossClient;
  /** getInvestorTrading 이 돌려줄 당일 기록 (테스트마다 바꾼다) */
  let latest: TossInvestorTradingRecord;

  beforeEach(() => {
    toss = createFakeTossClient();
    latest = record("2026-11-24", "2026-11-24T10:00:00+09:00", 1_000, -200);
    toss.getInvestorTrading = async (symbol, count) => {
      toss.calls.push({ method: "getInvestorTrading", args: [symbol, count] });
      return { records: [latest], nextUntil: null };
    };
    holder.client = toss;
    rankingThrottle.intervalMs = 0;
    samplerThrottle.intervalMs = 0;
    resetMarketDataCache();
    resetInvestorFlowState();
  });

  describe("isMarketHours", () => {
    it("is true on weekdays from 09:00 to 15:40 KST", () => {
      expect(isMarketHours(kst("2026-11-24", "08:59"))).toBe(false);
      expect(isMarketHours(kst("2026-11-24", "09:00"))).toBe(true);
      expect(isMarketHours(kst("2026-11-24", "15:40"))).toBe(true);
      expect(isMarketHours(kst("2026-11-24", "15:41"))).toBe(false);
      // 토요일
      expect(isMarketHours(kst("2026-11-28", "10:00"))).toBe(false);
    });
  });

  describe("recordSnapshot", () => {
    it("keeps one point per update time, oldest first, for today only", async () => {
      recordSnapshot("005930", record("2026-11-24", "2026-11-24T11:00:00+09:00", 3_000, 500), "2026-11-24");
      recordSnapshot("005930", record("2026-11-24", "2026-11-24T09:30:00+09:00", 1_000, 100), "2026-11-24");
      recordSnapshot("005930", record("2026-11-24", "2026-11-24T11:00:00+09:00", 9_999, 9_999), "2026-11-24");
      // 어제 기록 (오늘 아직 잠정치가 없을 때)
      recordSnapshot("005930", record("2026-11-23", "2026-11-23T18:00:00+09:00", 7_000, 7_000), "2026-11-24");

      latest = record("2026-11-24", "2026-11-24T11:00:00+09:00", 3_000, 500);
      const flows = await getIntradayFlows("005930", kst("2026-11-24", "11:05"));

      expect(flows.points).toEqual([
        { at: "2026-11-24T09:30:00+09:00", foreigner: 1_000, institution: 100 },
        { at: "2026-11-24T11:00:00+09:00", foreigner: 3_000, institution: 500 },
      ]);
    });
  });

  describe("getIntradayFlows", () => {
    it("records today's provisional figures and reports whether it keeps collecting", async () => {
      const flows = await getIntradayFlows("005930", kst("2026-11-24", "10:03"));

      expect(flows).toEqual({
        symbol: "005930",
        date: "2026-11-24",
        latestDate: "2026-11-24",
        points: [{ at: "2026-11-24T10:00:00+09:00", foreigner: 1_000, institution: -200 }],
        collecting: true,
      });
    });

    it("returns no points when Toss has no record for today (holiday, before the open)", async () => {
      latest = record("2026-11-23", "2026-11-23T18:00:00+09:00", 5_000, 5_000);
      const flows = await getIntradayFlows("005930", kst("2026-11-24", "08:30"));

      expect(flows).toMatchObject({ latestDate: "2026-11-23", points: [], collecting: false });
    });

    it("starts a new series when the day changes", async () => {
      await getIntradayFlows("005930", kst("2026-11-24", "10:03"));

      recordSnapshot("005930", record("2026-11-25", "2026-11-25T09:40:00+09:00", 50, 60), "2026-11-25");
      // 캐시된 기록은 어제 것이라 오늘 흐름에 섞이지 않는다
      const next = await getIntradayFlows("005930", kst("2026-11-25", "09:45"));

      expect(next.points).toEqual([{ at: "2026-11-25T09:40:00+09:00", foreigner: 50, institution: 60 }]);
    });
  });

  describe("background sampling", () => {
    it("samples symbols viewed today during market hours", async () => {
      await getIntradayFlows("005930", kst("2026-11-24", "10:00"));
      latest = record("2026-11-24", "2026-11-24T10:30:00+09:00", 2_500, -800);

      const recorded = await sampleTrackedSymbols(kst("2026-11-24", "10:35"));
      const flows = await getIntradayFlows("005930", kst("2026-11-24", "10:36"));

      expect(recorded).toBe(1);
      expect(flows.points.map((p) => p.foreigner)).toEqual([1_000, 2_500]);
    });

    it("does nothing outside market hours", async () => {
      await getIntradayFlows("005930", kst("2026-11-24", "10:00"));
      const before = toss.calls.length;

      expect(await sampleTrackedSymbols(kst("2026-11-24", "16:00"))).toBe(0);
      expect(toss.calls.length).toBe(before);
    });

    it("tracks at most 20 symbols, most recently viewed first, and forgets earlier days", async () => {
      for (let i = 0; i < 22; i++) {
        await getIntradayFlows(String(100000 + i), new Date(kst("2026-11-24", "10:00").getTime() + i * 1_000));
      }
      const symbols = trackedSymbols(kst("2026-11-24", "10:30"));

      expect(symbols).toHaveLength(20);
      expect(symbols[0]).toBe("100021");
      expect(symbols).not.toContain("100000");
      expect(trackedSymbols(kst("2026-11-25", "10:00"))).toEqual([]);
    });

    it("skips symbols that fail and keeps going", async () => {
      await getIntradayFlows("005930", kst("2026-11-24", "10:00"));
      await getIntradayFlows("000660", kst("2026-11-24", "10:01"));
      toss.getInvestorTrading = async (symbol) => {
        if (symbol === "000660") throw new Error("boom");
        return { records: [record("2026-11-24", "2026-11-24T10:30:00+09:00", 1, 1)], nextUntil: null };
      };

      expect(await sampleTrackedSymbols(kst("2026-11-24", "10:35"))).toBe(1);
    });

    it("spaces the calls so sampling does not use up the investor-trading limit", async () => {
      for (const [i, symbol] of ["005930", "000660", "035720"].entries()) {
        await getIntradayFlows(symbol, new Date(kst("2026-11-24", "10:00").getTime() + i * 1_000));
      }
      const times: number[] = [];
      toss.getInvestorTrading = async () => {
        times.push(Date.now());
        return { records: [record("2026-11-24", "2026-11-24T10:30:00+09:00", 1, 1)], nextUntil: null };
      };
      samplerThrottle.intervalMs = 30;

      expect(await sampleTrackedSymbols(kst("2026-11-24", "10:35"))).toBe(3);
      expect(times[1] - times[0]).toBeGreaterThanOrEqual(25);
      expect(times[2] - times[1]).toBeGreaterThanOrEqual(25);
    });
  });

  describe("GET /api/stocksim/rankings/investors", () => {
    it("returns foreigner net buy/sell rankings with names and change rates", async () => {
      const res = await request(app).get("/api/stocksim/rankings/investors?investor=foreigner");

      expect(res.status).toBe(200);
      expect(res.body.investor).toBe("foreigner");
      expect(res.body.rankedAt).toBe("2026-10-30T14:30:00+09:00");
      expect(res.body.netBuy).toEqual([
        { rank: 1, symbol: "005930", name: "삼성전자", amount: 120_000_000_000, price: 70_000, changeRate: expect.any(Number) },
        { rank: 2, symbol: "000660", name: "SK하이닉스", amount: 80_000_000_000, price: 200_000, changeRate: expect.any(Number) },
      ]);
      // 005935 는 fake 시세가 없어 가격·등락률이 비지만 순위는 나온다
      expect(res.body.netSell).toEqual([
        { rank: 1, symbol: "005935", name: "삼성전자우", amount: 30_000_000_000, price: null, changeRate: null },
      ]);
    });

    it("defaults to foreigners and calls Toss once for all investors", async () => {
      await request(app).get("/api/stocksim/rankings/investors");
      const inst = await request(app).get("/api/stocksim/rankings/investors?investor=institution");

      expect(inst.body).toEqual({ investor: "institution", rankedAt: null, netBuy: [], netSell: [] });
      expect(toss.calls.filter((c) => c.method === "getInvestorTradingRankings")).toEqual([
        { method: "getInvestorTradingRankings", args: [20] },
      ]);
    });

    it("keeps the ranking when names cannot be loaded", async () => {
      toss.getAllStocks = async () => {
        throw new Error("down");
      };
      const res = await request(app).get("/api/stocksim/rankings/investors?investor=individual");

      expect(res.status).toBe(200);
      expect(res.body.netSell[0]).toMatchObject({ symbol: "005930", name: null, amount: 150_000_000_000 });
    });

    it("rejects an unknown investor", async () => {
      const res = await request(app).get("/api/stocksim/rankings/investors?investor=pension");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_PARAM");
    });
  });

  it("GET /api/stocksim/stocks/:symbol/investors/intraday responds with today's series", async () => {
    const res = await request(app).get("/api/stocksim/stocks/005930/investors/intraday");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ symbol: "005930", points: expect.any(Array) });
  });
});
