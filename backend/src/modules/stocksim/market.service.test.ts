import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

import { createFakeTossClient, type FakeTossClient } from "../../testing/fakeTossClient.js";
import { kstDate } from "./indicators.js";
import type { CandlePoint, MarketInvestorDay } from "./stockSim.types.js";

/**
 * 시장 지수·공포탐욕 — 계산 규칙은 순수 함수로, 응답 조립은 fake 토스로 라우트까지 검증한다.
 */
const holder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("./toss/tossClient.js", () => ({ getTossClient: () => holder.client }));
vi.mock("./dart/dartClient.js", () => ({ getDartClient: () => null }));

const { createApp } = await import("../../app.js");
const {
  computeFearGreed,
  fearGreedLevel,
  intradayLine,
  linearScore,
  marketThrottle,
  previousClose,
  resetMarketCache,
} = await import("./market.service.js");

const app = createApp();

/** 하루 간격 일봉 (KST 자정), 오래된 것부터 */
function bars(closes: number[]): CandlePoint[] {
  const start = Date.UTC(2025, 0, 1) - 9 * 3_600_000;
  return closes.map((close, i) => ({
    time: new Date(start + i * 86_400_000).toISOString(),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));
}

/** 오래된 것부터 `from` → `to` 로 고르게 움직이는 값 */
function line(count: number, from: number, to: number): number[] {
  return Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));
}

/** `daily` 의 마지막 `count` 거래일 수급 (최신순) */
function flowDays(daily: CandlePoint[], count: number, smartMoney: number, tradingValue = 10e12): MarketInvestorDay[] {
  return Array.from({ length: count }, (_, i) => ({
    date: kstDate(daily[daily.length - 1 - i].time),
    individual: -smartMoney,
    foreigner: smartMoney / 2,
    institution: smartMoney / 2,
    otherCorporation: 0,
    tradingValue,
  }));
}

describe("fear & greed scoring", () => {
  it("maps values linearly onto 0..100 and clamps", () => {
    expect(linearScore(0, -0.1, 0.1)).toBe(50);
    expect(linearScore(0.05, -0.1, 0.1)).toBe(75);
    expect(linearScore(1, -0.1, 0.1)).toBe(100);
    expect(linearScore(-1, -0.1, 0.1)).toBe(0);
    // 뒤집힌 구간 (변동성: 클수록 공포)
    expect(linearScore(1.5, 1.5, 0.5)).toBe(0);
    expect(linearScore(0.5, 1.5, 0.5)).toBe(100);
  });

  it("labels the score in five levels", () => {
    expect(fearGreedLevel(0)).toBe("EXTREME_FEAR");
    expect(fearGreedLevel(24)).toBe("EXTREME_FEAR");
    expect(fearGreedLevel(25)).toBe("FEAR");
    expect(fearGreedLevel(45)).toBe("NEUTRAL");
    expect(fearGreedLevel(55)).toBe("NEUTRAL");
    expect(fearGreedLevel(56)).toBe("GREED");
    expect(fearGreedLevel(76)).toBe("EXTREME_GREED");
    expect(fearGreedLevel(100)).toBe("EXTREME_GREED");
  });

  it("reads a crash with foreign/institution selling and falling yields as fear", () => {
    // 1년 횡보 뒤 한 달 동안 20% 급락 (등락을 섞어 변동성도 커진다)
    const calm = Array.from({ length: 280 }, (_, i) => 2_600 + (i % 2 === 0 ? 5 : -5));
    const crash = Array.from({ length: 20 }, (_, i) => 2_600 * (1 - 0.01 * (i + 1)) + (i % 2 === 0 ? 30 : -30));
    const kospi = bars([...calm, ...crash]);
    const kosdaq = bars([...calm.map((c) => c / 3), ...crash.map((c, i) => c / 3 - i * 5)]);
    const bond = bars([...Array(280).fill(3.5), ...line(20, 3.45, 3.0)]);

    const fg = computeFearGreed({ kospi, kosdaq, bond, flows: flowDays(kospi, 5, -1e12) });

    expect(fg.score).toBeLessThan(25);
    expect(fg.level).toBe("EXTREME_FEAR");
    expect(fg.label).toBe("극단적 공포");
    expect(fg.factors.every((f) => f.score != null)).toBe(true);
    expect(fg.factors.find((f) => f.key === "momentum")?.reason).toContain("아래");
    expect(fg.factors.find((f) => f.key === "flow")?.reason).toContain("순매도");
    expect(fg.disclaimer).toContain("공식 공포·탐욕 지수가 아닙니다");
  });

  it("reads a steady rally with buying as greed", () => {
    const kospi = bars(line(300, 2_000, 2_800));
    const kosdaq = bars(line(300, 600, 1_000));
    const bond = bars(line(300, 3.0, 3.6));

    const fg = computeFearGreed({ kospi, kosdaq, bond, flows: flowDays(kospi, 5, 0.5e12) });

    expect(fg.score).toBeGreaterThan(75);
    expect(fg.level).toBe("EXTREME_GREED");
    expect(fg.factors.find((f) => f.key === "rsi")?.reason).toContain("과매수");
    expect(fg.factors.find((f) => f.key === "flow")?.reason).toContain("순매수");
  });

  it("averages only the factors it can compute", () => {
    const fg = computeFearGreed({ kospi: bars(line(300, 2_000, 2_800)), kosdaq: null, bond: null, flows: null });

    const missing = fg.factors.filter((f) => f.score == null).map((f) => f.key);
    expect(missing).toEqual(["riskAppetite", "safeHaven", "flow"]);

    const scores = fg.factors.flatMap((f) => (f.score == null ? [] : [f.score]));
    expect(fg.score).toBe(Math.round(scores.reduce((s, v) => s + v, 0) / scores.length));
  });

  it("recomputes the score one week and one month ago", () => {
    const fg = computeFearGreed({ kospi: bars(line(300, 2_000, 2_800)), kosdaq: null, bond: null, flows: null });

    expect(fg.history.map((h) => h.label)).toEqual(["1주 전", "1개월 전"]);
    expect(fg.history.every((h) => h.score != null)).toBe(true);
    expect(fg.asOf).toBe("2025-10-27");
  });

  it("needs at least a month of KOSPI data", () => {
    expect(() => computeFearGreed({ kospi: bars(line(20, 1, 2)), kosdaq: null, bond: null, flows: null })).toThrow(
      /부족/
    );
  });
});

describe("index helpers", () => {
  it("uses the bar before today as the previous close during the session", () => {
    const daily = bars([100, 110, 120]); // 마지막 봉 = 2025-01-03
    expect(previousClose(daily, "2025-01-03T05:00:00.000Z")).toBe(110);
    // 다음 날 장 시작 전이면 마지막 봉이 전일
    expect(previousClose(daily, "2025-01-04T00:00:00+09:00")).toBe(120);
    expect(previousClose([], null)).toBeNull();
  });

  it("keeps only the last trading day for the intraday line, in 5-minute steps", () => {
    const minute = (iso: string, close: number): CandlePoint => ({
      time: iso,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1,
    });
    const points = intradayLine([
      minute("2026-10-29T06:29:00.000Z", 1), // 전날 15:29 KST
      minute("2026-10-30T00:00:00.000Z", 10), // 09:00
      minute("2026-10-30T00:04:00.000Z", 14),
      minute("2026-10-30T00:05:00.000Z", 15),
    ]);

    expect(points).toEqual([
      { time: "2026-10-30T00:00:00.000Z", value: 14 },
      { time: "2026-10-30T00:05:00.000Z", value: 15 },
    ]);
  });
});

describe("market routes", () => {
  let toss: FakeTossClient;

  beforeEach(() => {
    toss = createFakeTossClient();
    holder.client = toss;
    marketThrottle.intervalMs = 0;
    resetMarketCache();
  });

  it("GET /api/stocksim/market returns both indices with change and the fear & greed index", async () => {
    const res = await request(app).get("/api/stocksim/market");

    expect(res.status).toBe(200);
    const [kospi, kosdaq] = res.body.indices;

    // fake 일봉: 코스피 최신 2800, 전일 2799 / 코스닥 최신 950, 전일 949.5
    expect(kospi).toMatchObject({ symbol: "KOSPI", name: "코스피", value: 2_820, prevClose: 2_799, change: 21 });
    expect(kospi.changeRate).toBeCloseTo(21 / 2_799);
    expect(kosdaq).toMatchObject({ symbol: "KOSDAQ", name: "코스닥", value: 960, prevClose: 949.5 });
    expect(kospi.intraday.length).toBeGreaterThan(50);
    expect(kospi.intraday.at(-1).value).toBe(2_800);

    expect(res.body.fearGreedNote).toBeNull();
    expect(res.body.fearGreed.score).toBeGreaterThanOrEqual(0);
    expect(res.body.fearGreed.score).toBeLessThanOrEqual(100);
    expect(res.body.fearGreed.factors).toHaveLength(6);
    expect(res.body.fearGreed.factors.every((f: { score: number | null }) => f.score != null)).toBe(true);
  });

  it("asks Toss only for index prices on a repeat call within the cache window", async () => {
    await request(app).get("/api/stocksim/market");
    const candleCalls = toss.calls.filter((c) => c.method === "getIndicatorCandles").length;

    await request(app).get("/api/stocksim/market");

    expect(toss.calls.filter((c) => c.method === "getIndicatorCandles")).toHaveLength(candleCalls);
  });

  it("still returns the index and fear & greed when market investor data fails", async () => {
    toss.getMarketInvestorTrading = async () => {
      throw new Error("down");
    };

    const res = await request(app).get("/api/stocksim/market");

    expect(res.status).toBe(200);
    const flow = res.body.fearGreed.factors.find((f: { key: string }) => f.key === "flow");
    expect(flow.score).toBeNull();
  });

  it("explains instead of failing when fear & greed cannot be computed", async () => {
    toss.dailyCount = 10;

    const res = await request(app).get("/api/stocksim/market");

    expect(res.status).toBe(200);
    expect(res.body.indices).toHaveLength(2);
    expect(res.body.fearGreed).toBeNull();
    expect(res.body.fearGreedNote).toContain("부족");
  });

  it("GET /api/stocksim/market/:symbol/chart returns index candles oldest first", async () => {
    const res = await request(app).get("/api/stocksim/market/kospi/chart?timeframe=1d");

    expect(res.status).toBe(200);
    expect(res.body.symbol).toBe("KOSPI");
    expect(res.body.candles).toHaveLength(300);
    expect(res.body.candles[0].close).toBe(2_501);
    expect(res.body.candles.at(-1).close).toBe(2_800);
    expect(res.body.indicators.ma20).toHaveLength(300);
  });

  it("rejects symbols other than KOSPI and KOSDAQ", async () => {
    const res = await request(app).get("/api/stocksim/market/KR_BOND_10Y/chart");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_SYMBOL");
  });

  it("GET /api/stocksim/market/:symbol/investors returns net buying amounts", async () => {
    const res = await request(app).get("/api/stocksim/market/KOSDAQ/investors");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(30);
    expect(res.body[0]).toMatchObject({
      individual: -100e9,
      foreigner: 100e9,
      institution: 50e9,
      otherCorporation: -50e9,
      tradingValue: 11_350e9,
    });
  });
});
