import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 그래프·지표 서비스 — SQL 은 로컬 MySQL 에서 확인했고, 여기서는 응답 형태·파라미터·읽기 전용을 본다.
 * DB 는 가짜 traderQuery 로 바꾼다.
 */

const db = vi.hoisted(() => ({
  queries: [] as { sql: string; params: unknown[] }[],
  answer: (_sql: string, _params: unknown[]): unknown[] => [],
}));

vi.mock("./traderDb.js", async () => {
  const real = await vi.importActual<typeof import("./traderDb.js")>("./traderDb.js");
  return {
    ...real,
    traderQuery: async (sql: string, params: unknown[] = []) => {
      db.queries.push({ sql, params });
      return db.answer(sql, params);
    },
  };
});

const svc = await import("./traderCharts.service.js");

beforeEach(() => {
  db.queries = [];
  db.answer = () => [];
});

const D0 = "2026-11-26 15:00:00.000000"; // 2026-11-27 00:00 KST

describe("trader charts", () => {
  it("validates symbol and interval", () => {
    expect(svc.isSymbol("005930")).toBe(true);
    expect(svc.isSymbol("0059'; DROP")).toBe(false);
    expect(svc.isSymbol("A".repeat(17))).toBe(false);
    expect(svc.isSymbol(["005930"])).toBe(false);
    expect(svc.parseInterval(undefined)).toBe(60);
    expect(svc.parseInterval("300")).toBe(300);
    expect(svc.parseInterval("120")).toBeNull();
    expect(svc.parseInterval("abc")).toBeNull();
  });

  it("builds a chart for the last trading day with markers, levels and latest indicators", async () => {
    db.answer = (sql) => {
      if (sql.includes("FROM engine_state")) return [{ value: JSON.stringify({ info: { symbols: ["005930"] } }) }];
      if (sql.includes("SELECT DISTINCT symbol FROM bars")) return [{ symbol: "000660" }, { symbol: "005930" }];
      if (sql.includes("ORDER BY id DESC LIMIT 1") && sql.includes("i_close"))
        return [{ bar_ts: "2026-11-27 02:27:00.000000", i_close: "69000", i_vwap: "68944.6759", i_sma20: null, i_rsi14: "16.9", i_macd_hist: "-438", i_atr14: "520", i_volume_ratio: "2.5" }];
      if (sql.includes("AS d0")) return [{ d0: D0, kst: "2026-11-27" }];
      if (sql.includes("SELECT start_ts, open"))
        return [{ start_ts: "2026-11-27 00:00:00.000000", open: "70000.0000", high: "70300.0000", low: "69800.0000", close: "70100.0000", volume: "2986.000000" }];
      if (sql.includes("ROW_NUMBER()")) return [{ t: "2026-11-27 00:00:00", vwap: "70050.1", sma20: null }];
      if (sql.includes("SELECT id FROM accounts")) return [{ id: 1 }];
      if (sql.includes("FROM fills f"))
        return [{ t: "2026-11-27 00:00:00", ts: "2026-11-27 00:00:30.000000", side: "BUY", qty: "11.000000", price: "70100.0000", strategy_id: "ma_cross" }];
      if (sql.includes("action IN ('BUY','SELL','EXIT')"))
        return [{ t: "2026-11-27 00:00:00", ts: "2026-11-27 00:01:00.000000", strategy_id: "intraday_score", action: "BUY", shadow: 1, risk_result: "SHADOW" }];
      if (sql.includes("FROM positions p"))
        return [{ qty: "11.000000", avg_price: "70100.0000", stop_loss: "69400.0000", take_profit: "71600.0000" }];
      return [];
    };
    const c = await svc.getChart("paper-default", "005930", 300);
    expect(c).toMatchObject({
      symbol: "005930",
      interval: 300,
      tradeDate: "2026-11-27",
      symbols: ["005930", "000660"],
      bars: [{ t: "2026-11-27T00:00:00.000Z", o: "70000.0000", h: "70300.0000", l: "69800.0000", c: "70100.0000", v: "2986.000000" }],
      lines: [{ t: "2026-11-27T00:00:00.000Z", vwap: "70050.1", sma20: null }],
      fills: [{ t: "2026-11-27T00:00:00.000Z", side: "BUY", qty: "11.000000", price: "70100.0000", strategyId: "ma_cross" }],
      signals: [{ strategyId: "intraday_score", action: "BUY", shadow: true, riskResult: "SHADOW" }],
      position: { qty: "11.000000", avgPrice: "70100.0000", stopLoss: "69400.0000", takeProfit: "71600.0000" },
      indicators: { close: "69000", vwap: "68944.6759", sma20: null, volumeRatio: "2.5" },
    });
    // 봉 구간·날짜 경계는 파라미터로 넘긴다 (문자열 조립 없음)
    const bars = db.queries.find((q) => q.sql.includes("SELECT start_ts, open"));
    expect(bars?.params).toEqual(["005930", 300, D0, D0]);
    const fills = db.queries.find((q) => q.sql.includes("FROM fills f"));
    expect(fills?.params).toEqual([300, 300, 1, "005930", D0, D0]);
  });

  it("returns an empty chart when there are no bars yet", async () => {
    db.answer = (sql) => (sql.includes("SELECT DISTINCT symbol FROM bars") ? [{ symbol: "005930" }] : []);
    const c = await svc.getChart("paper-default", "005930", 60);
    expect(c).toMatchObject({ tradeDate: null, symbols: ["005930"], bars: [], lines: [], fills: [], signals: [], position: null, indicators: null });
  });

  it("returns score history with thresholds and the latest parts", async () => {
    db.answer = (sql) => {
      if (sql.includes("AS d0")) return [{ d0: D0, kst: "2026-11-27" }];
      if (sql.includes("p_price"))
        return [{ id: 1, ts: "2026-11-27 00:01:00.1", bar_ts: "2026-11-27 00:00:00.000000", action: "WAIT", score: "42.00", p_price: "12", p_context: "30", p_issue: "0" }];
      if (sql.includes("'$.parts'"))
        return [
          {
            ts: "2026-11-27 00:01:00.000000",
            parts: JSON.stringify({
              technical: { points: "12", max: "30", note: "VWAP 위", available: true },
              flow: { points: "0", max: "25", note: "수급 데이터 없음·지연", available: false },
              unknown: { points: "1" },
            }),
          },
        ];
      return [];
    };
    const s = await svc.getScores("005930");
    expect(s.thresholds).toEqual({ buy: "80", watch: "65", exit: "30" });
    expect(s.tradeDate).toBe("2026-11-27");
    expect(s.points).toEqual([{ t: "2026-11-27T00:00:00.000Z", action: "WAIT", total: "42.00", price: "12", context: "30", issue: "0" }]);
    expect(s.latest?.parts).toEqual({
      technical: { points: "12", max: "30", note: "VWAP 위", available: true },
      flow: { points: "0", max: "25", note: "수급 데이터 없음·지연", available: false },
    });
  });

  it("summarises today's costs, round trips and rejection reasons", async () => {
    db.answer = (sql) => {
      if (sql.includes("SELECT id FROM accounts")) return [{ id: 1 }];
      if (sql.includes("COUNT(*) AS n, COALESCE(SUM(f.side = 'BUY')"))
        return [{ n: 4, buys: "2", sells: "2", commission: "120.0000", tax: "2800.0000", slippage: "500.0000", costs: "2920.0000" }];
      if (sql.includes("avg_rr")) return [{ avg_rr: "1.2000" }];
      if (sql.includes("WITH f AS"))
        return [
          { scope: "all", n: 10, wins: "5", win_rate: "0.500000", net: "4378.0000", avg_net: "437.8000" },
          { scope: "today", n: 2, wins: "1", win_rate: "0.500000", net: "-100.0000", avg_net: "-50.0000" },
        ];
      if (sql.includes("AS realized")) return [{ realized: "24420.0000", unrealized: "-3300.0000" }];
      if (sql.includes("SUBSTRING_INDEX"))
        return [
          { code: "RISK_REWARD", n: 7, sample: "RISK_REWARD: 손익비 0.9 < 1.5" },
          { code: "SPREAD", n: 1, sample: "SPREAD: 스프레드 40bp" },
        ];
      return [];
    };
    const s = await svc.getStats("paper-default");
    expect(s.today).toEqual({
      fills: 4,
      buys: 2,
      sells: 2,
      commission: "120.0000",
      tax: "2800.0000",
      slippage: "500.0000",
      costs: "2920.0000",
      avgPlannedRiskReward: "1.2000",
    });
    expect(s.trips.all).toEqual({ count: 10, wins: 5, winRate: "0.500000", netPnl: "4378.0000", avgPnl: "437.8000" });
    expect(s.trips.today.netPnl).toBe("-100.0000");
    expect(s.realizedPnl).toBe("24420.0000");
    expect(s.unrealizedPnl).toBe("-3300.0000");
    expect(s.rejections).toEqual([
      { code: "RISK_REWARD", count: 7, sample: "RISK_REWARD: 손익비 0.9 < 1.5" },
      { code: "SPREAD", count: 1, sample: "SPREAD: 스프레드 40bp" },
    ]);
  });

  it("works without an account (no fills, zero costs)", async () => {
    const s = await svc.getStats("paper-default");
    expect(s.today.fills).toBe(0);
    expect(s.today.costs).toBe("0");
    expect(s.trips.today).toEqual({ count: 0, wins: 0, winRate: null, netPnl: null, avgPnl: null });
    expect(s.rejections).toEqual([]);
  });

  it("only reads", async () => {
    db.answer = (sql) => {
      if (sql.includes("SELECT id FROM accounts")) return [{ id: 1 }];
      if (sql.includes("AS d0")) return [{ d0: D0, kst: "2026-11-27" }];
      return [];
    };
    await svc.getChart("paper-default", "005930", 60);
    await svc.getScores("005930");
    await svc.getStats("paper-default");
    expect(db.queries.length).toBeGreaterThan(5);
    for (const q of db.queries) {
      expect(q.sql.trimStart().toUpperCase()).toMatch(/^(SELECT|WITH)\b/);
      expect(q.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE)\b/i);
    }
  });
});
