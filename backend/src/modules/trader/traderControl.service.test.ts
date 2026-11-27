import { beforeEach, describe, expect, it, vi } from "vitest";

/** 화면 제어 → engine_state · risk_events 쓰기. DB 는 가짜로 바꾼다. */

const db = vi.hoisted(() => ({
  writes: [] as { sql: string; params: unknown[] }[],
  reads: [] as { sql: string; params: unknown[] }[],
  state: {} as Record<string, unknown>,
}));

vi.mock("./traderDb.js", async () => {
  const real = await vi.importActual<typeof import("./traderDb.js")>("./traderDb.js");
  const answer = (sql: string, params: unknown[]) => {
    if (sql.includes("FROM engine_state")) {
      const v = db.state[String(params[0])];
      return v === undefined ? [] : [{ value: JSON.stringify(v) }];
    }
    return [];
  };
  return {
    ...real,
    traderQuery: async (sql: string, params: unknown[] = []) => {
      db.reads.push({ sql, params });
      return answer(sql, params);
    },
    withTraderTx: async <R>(fn: (tx: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> }) => Promise<R>) =>
      fn({
        query: async (sql: string, params: unknown[] = []) => {
          if (sql.trimStart().startsWith("SELECT")) return answer(sql, params);
          db.writes.push({ sql, params });
          return [];
        },
      }),
  };
});

const svc = await import("./traderControl.service.js");

const BASE = {
  commission_rate_buy: "0.00015",
  commission_rate_sell: "0.00015",
  sell_tax_rate: "0.002",
  fee_rounding: "down",
  slippage_bps: "5",
  participation_rate: "0.1",
  strategy_order_value: "2000000",
  risk_max_order_value: "2500000",
  risk_max_position_value: "5000000",
  risk_daily_loss_limit: "300000",
  risk_atr_stop_mult: "1.5",
  risk_atr_take_mult: "3",
  risk_min_risk_reward: "1.5",
  risk_max_spread_bps: "30",
};

beforeEach(() => {
  db.writes = [];
  db.reads = [];
  db.state = {
    settings_effective: { base: BASE, effective: BASE, info: { strategies: [{ id: "ma_cross", shadow: false }, { id: "intraday_score", shadow: true }] } },
  };
});

function writtenState(key: string): Record<string, unknown> {
  const w = db.writes.find((x) => x.sql.startsWith("INSERT INTO engine_state") && x.params[0] === key);
  expect(w, key).toBeDefined();
  return JSON.parse(String(w!.params[1]));
}

function auditKinds(): string[] {
  return db.writes.filter((x) => x.sql.startsWith("INSERT INTO risk_events")).map((x) => String(x.params[0]));
}

describe("decimal helpers", () => {
  it("compares decimal strings without floats", () => {
    expect(svc.cmpDec("0.00015", "0.0002")).toBe(-1);
    expect(svc.cmpDec("10", "9.99999999")).toBe(1);
    expect(svc.cmpDec("1.50", "1.5")).toBe(0);
    expect(svc.cmpDec("0010", "10.0")).toBe(0);
    expect(svc.normalizeDec("002.5000")).toBe("2.5");
  });
});

describe("validateOverrides", () => {
  it("keeps only values that differ from trader.env", () => {
    expect(svc.validateOverrides({ slippage_bps: "5.0", strategy_order_value: "1000000", sell_tax_rate: null }, BASE)).toEqual({
      strategy_order_value: "1000000",
    });
  });

  it("rejects unknown keys, bad formats, ranges and broken relations", () => {
    const bad: Record<string, unknown>[] = [
      { paper_initial_cash: "1" },
      { database_url: "x" },
      { commission_rate_buy: "1" },
      { commission_rate_buy: "0.015%" },
      { participation_rate: "0" },
      { risk_daily_loss_limit: "0" },
      { risk_daily_loss_limit: "-1" },
      { fee_rounding: "up" },
      { slippage_bps: "1000" },
      { slippage_bps: 5 },
      { strategy_order_value: "3000000" }, // > 1회 주문 한도 250만
      { risk_max_order_value: "6000000" }, // > 종목 보유 한도 500만
      { risk_max_position_value: "1000000" }, // < 1회 주문 한도
    ];
    for (const v of bad) {
      expect(() => svc.validateOverrides(v, BASE), JSON.stringify(v)).toThrowError();
    }
  });
});

describe("control actions", () => {
  it("halt writes the same killswitch shape as the engine CLI and audits", async () => {
    await svc.halt("  테스트 정지  ", "web:owner");
    expect(writtenState("killswitch")).toMatchObject({ halted: true, reason: "테스트 정지" });
    expect(auditKinds()).toEqual(["HALT"]);
  });

  it("resume refuses when not halted, otherwise clears and audits", async () => {
    await expect(svc.resume("web:owner", "")).rejects.toMatchObject({ status: 409, code: "NOT_HALTED" });
    db.state.killswitch = { halted: true, reason: "manual" };
    await svc.resume("web:owner", "확인 완료");
    expect(writtenState("killswitch")).toMatchObject({ halted: false });
    expect(auditKinds()).toEqual(["RESUME"]);
  });

  it("strategy switch bumps the version and keeps other strategies", async () => {
    db.state.strategy_switches = { version: 4, values: { intraday_score: false } };
    await svc.setStrategy("ma_cross", false, "web:owner");
    expect(writtenState("strategy_switches")).toMatchObject({
      version: 5,
      values: { intraday_score: false, ma_cross: false },
      by: "web:owner",
    });
    expect(auditKinds()).toEqual(["STRATEGY_OFF"]);
    await expect(svc.setStrategy("unknown", true, "web:owner")).rejects.toMatchObject({ status: 404 });
  });

  it("settings update stores validated overrides with the next version", async () => {
    db.state.settings_overrides = { version: 2, values: { slippage_bps: "7" } };
    const r = await svc.updateSettings({ risk_min_risk_reward: "1.2", slippage_bps: null }, "web:owner");
    expect(r).toEqual({ version: 3, overrides: { risk_min_risk_reward: "1.2" } });
    expect(writtenState("settings_overrides")).toMatchObject({ version: 3, values: { risk_min_risk_reward: "1.2" } });
    expect(auditKinds()).toEqual(["SETTINGS_CHANGE"]);
  });

  it("settings update needs the engine to have published its base values", async () => {
    db.state = {};
    await expect(svc.updateSettings({ slippage_bps: "6" }, "web:owner")).rejects.toMatchObject({ code: "ENGINE_NOT_READY" });
    expect(db.writes).toEqual([]);
  });

  it("only ever writes engine_state and risk_events", async () => {
    db.state.killswitch = { halted: true };
    await svc.halt("x", "web:owner");
    await svc.resume("web:owner", "");
    await svc.setStrategy("intraday_score", true, "web:owner");
    await svc.updateSettings({ slippage_bps: "6" }, "web:owner");
    for (const w of db.writes) {
      expect(w.sql).toMatch(/^INSERT INTO (engine_state|risk_events) /);
    }
  });
});
