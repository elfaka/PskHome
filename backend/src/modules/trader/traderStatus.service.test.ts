import { beforeEach, describe, expect, it, vi } from "vitest";

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

const svc = await import("./traderStatus.service.js");

beforeEach(() => {
  db.queries = [];
  db.answer = () => [];
});

// 2026-11-27 (금) 10:00 KST = 01:00 UTC
const NOW = new Date("2026-11-27T01:00:00Z");

function stateRows(values: Record<string, unknown>) {
  return Object.entries(values).map(([key, value]) => ({
    key,
    value: JSON.stringify(value),
    updated_at: "2026-11-27 00:59:00.000000",
    updated_by: "web:owner",
  }));
}

describe("trader status", () => {
  it("knows KST market hours", () => {
    expect(svc.isMarketHours(NOW)).toBe(true);
    expect(svc.isMarketHours(new Date("2026-11-27T07:00:00Z"))).toBe(false); // 16:00 KST
    expect(svc.isMarketHours(new Date("2026-11-28T01:00:00Z"))).toBe(false); // 토요일
  });

  it("reports a running engine and pending settings", async () => {
    db.answer = (sql) => {
      if (sql.includes("FROM engine_state"))
        return stateRows({
          heartbeat: { at: "2026-11-27T09:59:58+09:00", mode: "paper", feed: "stocksim", db_ok: true, data_issues: {}, last_quote_at: { "005930": "2026-11-27T09:59:57+09:00" } },
          killswitch: { halted: false },
          strategy_switches: { version: 2, values: { ma_cross: false } },
          settings_overrides: { version: 3, values: { slippage_bps: "7" }, at: "2026-11-27T00:59:00+00:00" },
          settings_effective: { base: { slippage_bps: "5" }, effective: { slippage_bps: "5" }, overrides: {}, applied_version: 2, rejected: null, info: { mode: "paper" } },
        });
      if (sql.includes("MAX(ts) AS t FROM quotes")) return [{ t: "2026-11-27 00:59:57.000000" }];
      return [];
    };
    const s = await svc.getStatus(NOW);
    expect(s.engine).toMatchObject({ state: "running", mode: "paper", feed: "stocksim", dbOk: true, heartbeatAt: "2026-11-27T00:59:58.000Z" });
    expect(s.switches).toEqual({ ma_cross: false });
    expect(s.settings?.pending).toEqual({ version: 3, values: { slippage_bps: "7" }, at: "2026-11-27T00:59:00.000Z" });
    expect(s.lastQuoteBySymbol).toEqual({ "005930": "2026-11-27T00:59:57.000Z" });
    expect(s.alerts).toEqual([]);
    expect(s.marketOpen).toBe(true);
  });

  it("raises alerts for halt, stale engine, stale quotes and rejected settings", async () => {
    db.answer = (sql) => {
      if (sql.includes("FROM engine_state"))
        return stateRows({
          heartbeat: { at: "2026-11-27T00:58:00Z", db_ok: false, data_issues: { "000660": "봉 누락 3개" } },
          killswitch: { halted: true, reason: "manual" },
          settings_effective: { base: {}, effective: {}, applied_version: 1, rejected: { version: 2, reason: "범위 밖" } },
        });
      return [];
    };
    const s = await svc.getStatus(NOW);
    expect(s.engine.state).toBe("stale");
    expect(s.killswitch).toMatchObject({ halted: true, reason: "manual", updatedBy: "web:owner" });
    expect(s.alerts.map((a) => a.code)).toEqual(["HALTED", "ENGINE_STALE", "ENGINE_DB", "DATA_ISSUE", "SETTINGS_REJECTED"]);
  });

  it("says unknown when the engine never sent a heartbeat", async () => {
    const s = await svc.getStatus(NOW);
    expect(s.engine.state).toBe("unknown");
    expect(s.settings).toBeNull();
    expect(s.alerts.map((a) => a.code)).toEqual(["ENGINE_UNKNOWN"]);
  });

  it("computes MDD in SQL with the current equity as the last point", async () => {
    db.answer = (sql) => {
      if (sql.includes("FROM daily_equity"))
        return [
          { trade_date: "2026-11-27", start_equity: "10100000.0000" },
          { trade_date: "2026-11-26", start_equity: "10000000.0000" },
        ];
      if (sql.includes("MIN((e - peak) / peak)")) return [{ mdd: "-0.019802" }];
      return [];
    };
    const e = await svc.getEquity("paper-default", "9900000.0000");
    expect(e.points.map((p) => p.date)).toEqual(["2026-11-26", "2026-11-27"]);
    expect(e.mdd).toBe("-0.019802");
    const q = db.queries.find((x) => x.sql.includes("MIN((e - peak)"));
    expect(q?.params).toEqual(["10000000.0000", "10100000.0000", "9900000.0000"]);
  });

  it("merges fills, failed orders and events newest first with levels", async () => {
    db.answer = (sql) => {
      if (sql.includes("FROM fills f"))
        return [{ id: 1, ts: "2026-11-27 00:10:00.000000", symbol: "005930", side: "BUY", qty: "11", price: "170200", strategy_id: "ma_cross" }];
      if (sql.includes("FROM orders o"))
        return [{ id: 9, updated_at: "2026-11-27 00:20:00.000000", symbol: "005930", side: "BUY", qty: "11", status: "REJECTED", reject_reason: "cash" }];
      if (sql.includes("FROM risk_events"))
        return [
          { id: 5, ts: "2026-11-27 00:30:00.000000", kind: "HALT", symbol: null, detail: '{"reason":"manual","by":"web:owner"}' },
          { id: 4, ts: "2026-11-27 00:05:00.000000", kind: "SETTINGS_APPLIED", symbol: null, detail: '{"diff":{"slippage_bps":["5","7"]}}' },
        ];
      return [];
    };
    const a = await svc.listActivity("paper-default", 10);
    expect(a.map((x) => [x.source, x.level])).toEqual([
      ["event", "error"],
      ["order", "warn"],
      ["fill", "info"],
      ["event", "info"],
    ]);
    expect(a[0].message).toContain("manual");
    expect(a[3].message).toContain("slippage_bps 5→7");
  });

  it("only reads", async () => {
    await svc.getStatus(NOW);
    await svc.getStrategies();
    await svc.listActivity("paper-default", 10);
    for (const q of db.queries) expect(q.sql.trimStart().toUpperCase().startsWith("SELECT")).toBe(true);
  });
});
