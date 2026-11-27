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
  entry_cutoff: "15:00:00",
  eod_exit: "15:15:00",
  universe_mode: "fixed",
  universe_max_symbols: "10",
  universe_pinned: null,
  risk_max_open_positions: null,
};

const INFO = {
  strategies: [{ id: "ma_cross", shadow: false }, { id: "intraday_score", shadow: true }],
  market_open: "09:00:00",
  market_close: "15:20:00",
};

beforeEach(() => {
  db.writes = [];
  db.reads = [];
  db.state = {
    settings_effective: { effective: BASE, applied_version: 1, info: INFO },
    settings: { version: 1, values: BASE, by: "seed:trader.env", previous: null },
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

describe("validateSettings", () => {
  const HOURS = { open: "09:00:00", close: "15:20:00" };

  it("merges changes onto the current values and normalizes", () => {
    const next = svc.validateSettings({ slippage_bps: "05.50", entry_cutoff: "14:30", eod_exit: null }, BASE, HOURS);
    expect(next).toEqual({ ...BASE, slippage_bps: "5.5", entry_cutoff: "14:30:00", eod_exit: null });
    expect(svc.diffSettings(BASE, next)).toEqual({
      slippage_bps: ["5", "5.5"],
      entry_cutoff: ["15:00:00", "14:30:00"],
      eod_exit: ["15:15:00", null],
    });
    // 같은 값(표기만 다른 것)은 바뀐 것으로 보지 않는다
    expect(svc.diffSettings(BASE, svc.validateSettings({ slippage_bps: "5.000" }, BASE, HOURS))).toEqual({});
  });

  it("validates the symbol selection settings", () => {
    const next = svc.validateSettings(
      { universe_mode: "auto", universe_max_symbols: "05", universe_pinned: " 005930, 000660,005930 ", risk_max_open_positions: "3" },
      BASE,
      { ...HOURS, feed: "stocksim" }
    );
    expect(next).toMatchObject({ universe_mode: "auto", universe_max_symbols: "5", universe_pinned: "005930,000660", risk_max_open_positions: "3" });
    // 비우면 없음·제한 없음
    expect(svc.validateSettings({ universe_pinned: "", risk_max_open_positions: null }, next, HOURS)).toMatchObject({
      universe_pinned: null,
      risk_max_open_positions: null,
    });
    const bad: Record<string, unknown>[] = [
      { universe_mode: "random" },
      { universe_max_symbols: "0" },
      { universe_max_symbols: "11" },
      { universe_max_symbols: null },
      { universe_max_symbols: "1", universe_pinned: "005930,000660" }, // 항상 포함 > 최대
      { universe_pinned: "0059;30" },
      { risk_max_open_positions: "0" },
      { risk_max_open_positions: "2.5" },
    ];
    for (const v of bad) expect(() => svc.validateSettings(v, BASE, HOURS), JSON.stringify(v)).toThrowError();
    // 자동 선정은 실시세(stocksim)에서만
    expect(() => svc.validateSettings({ universe_mode: "auto" }, BASE, { ...HOURS, feed: "synthetic" })).toThrowError(/stocksim/);
  });

  it("rejects unknown keys, bad formats, ranges and broken relations", () => {
    const bad: Record<string, unknown>[] = [
      { paper_initial_cash: "1" },
      { database_url: "x" },
      { commission_rate_buy: "1" },
      { commission_rate_buy: "0.015%" },
      { commission_rate_buy: null }, // 필수 값은 비울 수 없다
      { participation_rate: "0" },
      { risk_daily_loss_limit: "0" },
      { risk_daily_loss_limit: "-1" },
      { fee_rounding: "up" },
      { slippage_bps: "1000" },
      { slippage_bps: 5 },
      { strategy_order_value: "3000000" }, // > 1회 주문 한도 250만
      { risk_max_order_value: "6000000" }, // > 종목 보유 한도 500만
      { risk_max_position_value: "1000000" }, // < 1회 주문 한도
      { entry_cutoff: "3pm" },
      { entry_cutoff: "9:05" },
      { entry_cutoff: "08:30" }, // 장 시작 전
      { eod_exit: "15:25" }, // 장 마감(15:20) 뒤
      { entry_cutoff: "15:10", eod_exit: "15:05" }, // 진입 마감이 청산보다 늦다
    ];
    for (const v of bad) {
      expect(() => svc.validateSettings(v, BASE, HOURS), JSON.stringify(v)).toThrowError();
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

  it("settings update saves the full values as the next version with the previous kept", async () => {
    const r = await svc.updateSettings({ risk_min_risk_reward: "1.2", eod_exit: null }, "web:owner");
    expect(r.version).toBe(2);
    const doc = writtenState("settings");
    expect(doc).toMatchObject({
      version: 2,
      by: "web:owner",
      values: { ...BASE, risk_min_risk_reward: "1.2", eod_exit: null },
      previous: { version: 1, values: BASE },
    });
    expect(auditKinds()).toEqual(["SETTINGS_CHANGE"]);
    const audit = db.writes.find((w) => w.sql.startsWith("INSERT INTO risk_events"))!;
    expect(JSON.parse(String(audit.params[1])).diff).toEqual({
      risk_min_risk_reward: ["1.5", "1.2"],
      eod_exit: ["15:15:00", null],
    });
  });

  it("settings update refuses no-op changes and works before the engine moved settings to the DB", async () => {
    await expect(svc.updateSettings({ slippage_bps: "5.0" }, "web:owner")).rejects.toMatchObject({ status: 400, code: "NO_CHANGE" });
    db.state = { settings_effective: { effective: BASE } }; // 옛 엔진 (settings 없음)
    await expect(svc.updateSettings({ slippage_bps: "6" }, "web:owner")).rejects.toMatchObject({ status: 409, code: "ENGINE_NOT_READY" });
    expect(db.writes).toEqual([]);
  });

  it("fills keys missing from an older DB doc with the engine's applied values", async () => {
    const { universe_mode: _m, universe_max_symbols: _x, universe_pinned: _p, risk_max_open_positions: _r, ...old } = BASE;
    db.state.settings = { version: 1, values: old, previous: null };
    await svc.updateSettings({ risk_max_open_positions: "3" }, "web:owner");
    expect(writtenState("settings")).toMatchObject({ version: 2, values: { ...BASE, risk_max_open_positions: "3" } });
  });

  it("uses the engine's market hours for the time range", async () => {
    await expect(svc.updateSettings({ eod_exit: "15:25" }, "web:owner")).rejects.toMatchObject({ code: "INVALID_SETTINGS" });
    db.state.settings_effective = { effective: BASE, info: { ...INFO, market_close: "15:30:00" } };
    await expect(svc.updateSettings({ eod_exit: "15:25" }, "web:owner")).resolves.toMatchObject({ version: 2 });
  });

  it("revert restores the previous values as a new version", async () => {
    await expect(svc.revertSettings("web:owner")).rejects.toMatchObject({ status: 409, code: "NO_PREVIOUS" });
    db.state.settings = {
      version: 7,
      values: { ...BASE, slippage_bps: "9" },
      previous: { version: 6, values: BASE },
    };
    const r = await svc.revertSettings("web:owner");
    expect(r).toMatchObject({ version: 8, restored: 6, values: BASE });
    expect(writtenState("settings")).toMatchObject({
      version: 8,
      values: BASE,
      previous: { version: 7, values: { ...BASE, slippage_bps: "9" } },
    });
    expect(auditKinds()).toEqual(["SETTINGS_REVERT"]);
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
