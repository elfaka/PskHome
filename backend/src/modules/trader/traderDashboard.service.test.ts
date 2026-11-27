import { beforeEach, describe, expect, it, vi } from "vitest";

/** 서비스 → SQL 매핑. DB 는 가짜 query 로 바꾼다. */

const db = vi.hoisted(() => ({
  queries: [] as { sql: string; params: unknown[] }[],
  answer: (_sql: string): unknown[] => [],
}));

vi.mock("./traderDb.js", async () => {
  const real = await vi.importActual<typeof import("./traderDb.js")>("./traderDb.js");
  return {
    ...real,
    traderQuery: async (sql: string, params: unknown[] = []) => {
      db.queries.push({ sql, params });
      return db.answer(sql);
    },
  };
});

const svc = await import("./traderDashboard.service.js");
const { utcIso } = await import("./traderDb.js");

beforeEach(() => {
  db.queries = [];
  db.answer = () => [];
});

describe("trader dashboard service", () => {
  it("only reads (every statement is a SELECT)", async () => {
    db.answer = (sql) => (sql.includes("FROM accounts") ? [{ id: 1, name: "paper-default", broker: "paper" }] : []);
    await svc.getSummary("paper-default");
    await svc.listOrders("paper-default", 10);
    await svc.listFills("paper-default", 10);
    await svc.listDecisions(10, { strategy: "ma_cross", signalsOnly: true });
    await svc.getPerformance();
    await svc.listRiskEvents(10);
    for (const q of db.queries) expect(q.sql.trimStart().toUpperCase().startsWith("SELECT")).toBe(true);
  });

  it("maps summary with decimal strings and UTC ISO times", async () => {
    db.answer = (sql) => {
      if (sql.includes("engine_state")) return [{ value: '{"halted": true, "reason": "manual"}', updated_at: "2026-11-26 01:00:00.000000" }];
      if (sql.includes("MAX(ts) AS t FROM quotes")) return [{ t: "2026-11-26 06:19:50.000000" }];
      if (sql.includes("FROM accounts")) return [{ id: 7, name: "paper-default", broker: "paper", created_at: "2026-11-26 00:00:00" }];
      if (sql.includes("cash_ledger"))
        return [{ cash: "9124526.0000", market_value: "981400.0000", equity: "10105926.0000", start_equity: "10000000.0000", day_pnl: "105926.0000" }];
      if (sql.includes("COUNT(*) AS n")) return [{ n: 2 }];
      if (sql.includes("FROM positions p")) return [];
      return [];
    };
    const s = await svc.getSummary("paper-default");
    expect(s.cash).toBe("9124526.0000");
    expect(s.dayPnl).toBe("105926.0000");
    expect(s.openOrders).toBe(2);
    expect(s.killswitch).toEqual({ halted: true, reason: "manual", updatedAt: "2026-11-26T01:00:00.000Z" });
    expect(s.lastQuoteAt).toBe("2026-11-26T06:19:50.000Z");
    // 계좌 id 는 사용자 입력이 아니라 조회 결과로만 쓴다
    expect(db.queries.find((q) => q.sql.includes("cash_ledger"))?.params).toEqual([7, 7, 7, 7]);
  });

  it("returns an empty summary when the account does not exist yet", async () => {
    const s = await svc.getSummary("missing");
    expect(s.account).toBeNull();
    expect(s.positions).toEqual([]);
  });

  it("passes filters as parameters, never as SQL text", async () => {
    await svc.listDecisions(5, { strategy: "intraday_score", signalsOnly: true });
    const q = db.queries[0];
    expect(q.sql).not.toContain("intraday_score");
    expect(q.params).toEqual(["intraday_score", 5]);
  });

  it("parses decision JSON columns and components", async () => {
    db.answer = () => [
      {
        id: 3, ts: "2026-11-26 00:31:00.123456", bar_ts: "2026-11-26 00:30:00", strategy_id: "intraday_score",
        symbol: "005930", action: "WAIT", reason: "합계 30", shadow: 1, score: "30.00", reasons: '["technical: 30/30"]',
        inputs: '{"components": {"issue": {"status": "NOT_CONFIGURED"}}}',
      },
    ];
    const [d] = await svc.listDecisions(1);
    expect(d.shadow).toBe(true);
    expect(d.ts).toBe("2026-11-26T00:31:00.123Z");
    expect(d.reasons).toEqual(["technical: 30/30"]);
    expect(d.components).toEqual({ issue: { status: "NOT_CONFIGURED" } });
    expect(d.parts).toBeNull();
    expect(d.ma).toBeNull();
  });

  it("returns the full reasoning: score items, moving averages and invalidation", async () => {
    db.answer = () => [
      {
        id: 4, ts: "2026-11-26 00:31:00", bar_ts: "2026-11-26 00:30:00", strategy_id: "intraday_score", symbol: "005930",
        action: "BUY", reason: "합계 82 ≥ 80", shadow: 1, score: "82.00",
        inputs: JSON.stringify({ parts: { technical: { points: "27", max: "30", note: "VWAP 위", available: true }, global: { points: "0", max: "15", note: "VIX 데이터 없음", available: false } } }),
        invalidation: '["VWAP 하회", "거래량 감소"]',
        valid_until: "2026-11-26 00:36:00",
      },
      {
        id: 3, ts: "2026-11-26 00:31:00", bar_ts: "2026-11-26 00:30:00", strategy_id: "ma_cross", symbol: "005930",
        action: "BUY", reason: "golden cross", shadow: 0,
        inputs: JSON.stringify({ fast_ma: "70120", slow_ma: "70050.5", diff: "69.5", close: "70200" }),
      },
    ];
    const [score, ma] = await svc.listDecisions(2);
    expect(score.parts).toEqual({
      technical: { points: "27", max: "30", note: "VWAP 위", available: true },
      global: { points: "0", max: "15", note: "VIX 데이터 없음", available: false },
    });
    expect(score.invalidation).toEqual(["VWAP 하회", "거래량 감소"]);
    expect(score.validUntil).toBe("2026-11-26T00:36:00.000Z");
    expect(ma.ma).toEqual({ fast: "70120", slow: "70050.5", diff: "69.5" });
  });

  it("clamps limits", () => {
    expect(svc.clampLimit("10")).toBe(10);
    expect(svc.clampLimit("0")).toBe(50);
    expect(svc.clampLimit("x", 30)).toBe(30);
    expect(svc.clampLimit("100000")).toBe(200);
  });

  it("converts UTC DATETIME strings to ISO", () => {
    expect(utcIso("2026-11-26 00:30:00")).toBe("2026-11-26T00:30:00.000Z");
    expect(utcIso("2026-11-26 00:30:00.5")).toBe("2026-11-26T00:30:00.500Z");
    expect(utcIso(null)).toBeNull();
  });
});

describe("trader DB not configured", () => {
  it("fails with 503 instead of touching any database", async () => {
    const real = await vi.importActual<typeof import("./traderDb.js")>("./traderDb.js");
    await expect(real.traderQuery("SELECT 1")).rejects.toMatchObject({ status: 503, code: "TRADER_DB_NOT_CONFIGURED" });
  });
});
