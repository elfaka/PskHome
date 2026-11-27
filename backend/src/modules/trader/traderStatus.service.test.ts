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
    expect(svc.marketPhase(NOW)).toBe("continuous");
    expect(svc.marketPhase(new Date("2026-11-27T06:19:59Z"))).toBe("continuous"); // 15:19:59 KST
    expect(svc.marketPhase(new Date("2026-11-27T06:20:00Z"))).toBe("closing_auction"); // 15:20 KST
    expect(svc.marketPhase(new Date("2026-11-27T06:29:59Z"))).toBe("closing_auction");
    expect(svc.marketPhase(new Date("2026-11-27T06:30:00Z"))).toBe("closed"); // 15:30 KST
    expect(svc.marketPhase(new Date("2026-11-26T23:59:00Z"))).toBe("closed"); // 08:59 KST
  });

  it("does not warn about missing quotes during the closing auction (15:20~15:30, no trades)", async () => {
    const at = (iso: string) => {
      db.answer = (sql) => {
        if (sql.includes("FROM engine_state"))
          return stateRows({
            heartbeat: { at: new Date(new Date(iso).getTime() - 2_000).toISOString(), db_ok: true, last_quote_at: { "005930": "2026-11-27T06:19:59Z" } },
            killswitch: { halted: false },
          });
        return [];
      };
      return svc.getStatus(new Date(iso));
    };
    const auction = await at("2026-11-27T06:25:00Z"); // 15:25 KST, 마지막 체결 15:19:59
    expect(auction.marketPhase).toBe("closing_auction");
    expect(auction.marketOpen).toBe(true);
    expect(auction.alerts.map((a) => a.code)).not.toContain("QUOTE_STALE");
    // 정규장 중에 1분 넘게 없으면 경고
    const regular = await at("2026-11-27T06:19:30Z");
    db.answer = (sql) =>
      sql.includes("FROM engine_state")
        ? stateRows({ heartbeat: { at: "2026-11-27T06:19:28Z", db_ok: true, last_quote_at: { "005930": "2026-11-27T06:18:00Z" } }, killswitch: { halted: false } })
        : [];
    const stale = await svc.getStatus(new Date("2026-11-27T06:19:30Z"));
    expect(regular.alerts.map((a) => a.code)).not.toContain("QUOTE_STALE");
    expect(stale.alerts.map((a) => a.code)).toContain("QUOTE_STALE");
  });

  it("reports a running engine and pending settings", async () => {
    db.answer = (sql) => {
      if (sql.includes("FROM engine_state"))
        return stateRows({
          heartbeat: { at: "2026-11-27T09:59:58+09:00", mode: "paper", feed: "stocksim", db_ok: true, data_issues: {}, last_quote_at: { "005930": "2026-11-27T09:59:57+09:00" } },
          killswitch: { halted: false },
          strategy_switches: { version: 2, values: { ma_cross: false } },
          settings: {
            version: 3,
            values: { slippage_bps: "7" },
            by: "web:owner",
            at: "2026-11-27T00:59:00+00:00",
            previous: { version: 2, values: { slippage_bps: "5" } },
          },
          settings_effective: { effective: { slippage_bps: "5" }, applied_version: 2, rejected: null, env_ignored: ["slippage_bps"], info: { mode: "paper" } },
        });
      if (sql.includes("MAX(ts) AS t FROM quotes")) return [{ t: "2026-11-27 00:59:57.000000" }];
      return [];
    };
    const s = await svc.getStatus(NOW);
    expect(s.engine).toMatchObject({ state: "running", mode: "paper", feed: "stocksim", dbOk: true, heartbeatAt: "2026-11-27T00:59:58.000Z" });
    expect(s.switches).toEqual({ ma_cross: false });
    expect(s.settings).toMatchObject({
      ready: true,
      values: { slippage_bps: "7" },
      effective: { slippage_bps: "5" },
      savedVersion: 3,
      savedBy: "web:owner",
      appliedVersion: 2,
      pending: { version: 3, at: "2026-11-27T00:59:00.000Z" },
      previousVersion: 2,
      envIgnored: ["slippage_bps"],
    });
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
          settings_effective: { effective: {}, applied_version: 1, rejected: { version: 2, reason: "범위 밖" } },
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
      if (sql.includes("AS dd FROM"))
        return [
          { i: 0, dd: "0.000000" },
          { i: 1, dd: "0.000000" },
          { i: 2, dd: "-0.019802" },
        ];
      return [];
    };
    const e = await svc.getEquity("paper-default", "9900000.0000");
    expect(e.points).toEqual([
      { date: "2026-11-26", equity: "10000000.0000", drawdown: "0.000000" },
      { date: "2026-11-27", equity: "10100000.0000", drawdown: "0.000000" },
    ]);
    expect(e.current).toEqual({ equity: "9900000.0000", drawdown: "-0.019802" });
    expect(e.mdd).toBe("-0.019802");
    const q = db.queries.find((x) => x.sql.includes("MIN((e - peak)"));
    expect(q?.params).toEqual(["10000000.0000", "10100000.0000", "9900000.0000"]);
  });

  it("merges fills, failed orders and events newest first with levels", async () => {
    db.answer = (sql) => {
      if (sql.includes("FROM fills f"))
        return [{ id: 1, ts: "2026-11-27 00:10:00.000000", symbol: "005930", side: "BUY", qty: "11.000000", price: "170200.0000", strategy_id: "ma_cross" }];
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
    expect(a[2].message).toBe("매수 체결 11주 @ 170200 · ma_cross");
  });

  it("trims trailing zeros for display", () => {
    expect(svc.plain("13.000000")).toBe("13");
    expect(svc.plain("74062.5000")).toBe("74062.5");
    expect(svc.plain("100")).toBe("100");
    expect(svc.plain("1000.0000")).toBe("1000");
  });

  it("only reads", async () => {
    await svc.getStatus(NOW);
    await svc.getStrategies();
    await svc.listActivity("paper-default", 10);
    for (const q of db.queries) expect(q.sql.trimStart().toUpperCase().startsWith("SELECT")).toBe(true);
  });
});

describe("today's symbols", () => {
  it("reports the engine's selection and what it is watching (incl. held symbols outside the list)", async () => {
    db.answer = (sql) => {
      if (sql.includes("FROM engine_state"))
        return stateRows({
          heartbeat: { at: "2026-11-27T00:59:58Z", db_ok: true },
          killswitch: { halted: false },
          settings_effective: { effective: {}, applied_version: 1, info: { symbols: ["005930", "036930", "035420"] } },
          universe: {
            date: "2026-11-27",
            mode: "auto",
            source: "rankings",
            at: "2026-11-26T23:50:00+00:00",
            symbols: [
              { symbol: "005930", name: "삼성전자", score: "350000000", foreigner: "400000000", institution: "-50000000", pinned: false },
              { symbol: "036930", name: "주성엔지니어링", score: "250000000", foreigner: "100000000", institution: "150000000", pinned: false },
            ],
            excluded: [{ symbol: "069500", name: "KODEX 200", reason: "주식 아님 (ETF)" }],
          },
        });
      return [];
    };
    const s = await svc.getStatus(NOW);
    expect(s.universe).toEqual({
      date: "2026-11-27",
      mode: "auto",
      source: "rankings",
      at: "2026-11-26T23:50:00.000Z",
      symbols: [
        { symbol: "005930", name: "삼성전자", score: "350000000", foreigner: "400000000", institution: "-50000000", pinned: false },
        { symbol: "036930", name: "주성엔지니어링", score: "250000000", foreigner: "100000000", institution: "150000000", pinned: false },
      ],
      excluded: [{ symbol: "069500", name: "KODEX 200", reason: "주식 아님 (ETF)" }],
      watching: ["005930", "036930", "035420"],
    });
  });

  it("labels the daily selection in the activity log", async () => {
    db.answer = (sql) =>
      sql.includes("FROM risk_events")
        ? [{ id: 3, ts: "2026-11-26 23:50:00.000000", kind: "UNIVERSE_SELECTED", symbol: null, detail: JSON.stringify({ symbols: ["005930", "036930"] }) }]
        : [];
    const items = await svc.listActivity("paper-default", 10);
    expect(items[0]).toMatchObject({ level: "info", message: "오늘의 종목 선정 · 005930, 036930" });
  });
});
