import { HttpError } from "../../lib/httpError.js";
import { traderQuery, withTraderTx, type TraderTx } from "./traderDb.js";

/**
 * 화면 제어 — 엔진 DB 의 engine_state 에 쓰고, 엔진이 감시 루프(약 5초)에서 읽어 반영한다.
 * 엔진과 직접 통신하지 않는다. 형식은 trader/src/trader/control.py · risk/killswitch.py 와 같아야 한다.
 *
 * 쓰는 곳은 engine_state(INSERT·UPDATE)와 risk_events(INSERT, 조작 기록)뿐이다.
 * 금액·비율은 문자열 그대로 검증·저장한다 (JS number 로 바꾸지 않는다).
 */

const KILLSWITCH = "killswitch";
const SWITCHES = "strategy_switches";
const OVERRIDES = "settings_overrides";
const EFFECTIVE = "settings_effective";

type Rule =
  | { kind: "rate" } // 0 이상 1 미만
  | { kind: "fraction" } // 0 초과 1 이하
  | { kind: "nonneg"; max?: string }
  | { kind: "positive"; max?: string }
  | { kind: "enum"; values: string[] };

/** 화면에서 바꿀 수 있는 설정. trader/src/trader/control.py 의 TUNABLE 과 같아야 한다. */
export const TUNABLE_RULES: Record<string, Rule> = {
  commission_rate_buy: { kind: "rate" },
  commission_rate_sell: { kind: "rate" },
  sell_tax_rate: { kind: "rate" },
  fee_rounding: { kind: "enum", values: ["down", "half_up"] },
  slippage_bps: { kind: "nonneg", max: "500" },
  participation_rate: { kind: "fraction" },
  strategy_order_value: { kind: "positive" },
  risk_max_order_value: { kind: "positive" },
  risk_max_position_value: { kind: "positive" },
  risk_daily_loss_limit: { kind: "positive" },
  risk_atr_stop_mult: { kind: "positive", max: "20" },
  risk_atr_take_mult: { kind: "positive", max: "50" },
  risk_min_risk_reward: { kind: "positive", max: "20" },
  risk_max_spread_bps: { kind: "positive", max: "1000" },
};

export const TUNABLE_KEYS = Object.keys(TUNABLE_RULES);

// ── Decimal 문자열 비교 (음이 아닌 수만) ────────────────────────────────────

const DEC = /^\d{1,14}(\.\d{1,8})?$/;

/** "0010.500" → "10.5" */
export function normalizeDec(v: string): string {
  const [i, f = ""] = v.split(".");
  const int = i.replace(/^0+(?=\d)/, "");
  const frac = f.replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

/** a < b → -1, a = b → 0, a > b → 1 */
export function cmpDec(a: string, b: string): number {
  const [ai, af = ""] = normalizeDec(a).split(".");
  const [bi, bf = ""] = normalizeDec(b).split(".");
  if (ai.length !== bi.length) return ai.length < bi.length ? -1 : 1;
  if (ai !== bi) return ai < bi ? -1 : 1;
  const n = Math.max(af.length, bf.length);
  const x = af.padEnd(n, "0");
  const y = bf.padEnd(n, "0");
  return x === y ? 0 : x < y ? -1 : 1;
}

function checkValue(key: string, raw: string): string {
  const rule = TUNABLE_RULES[key];
  if (rule.kind === "enum") {
    if (!rule.values.includes(raw)) throw bad(`${key}: ${rule.values.join(" | ")} 중 하나여야 합니다.`);
    return raw;
  }
  const v = raw.trim();
  if (!DEC.test(v)) throw bad(`${key}: 숫자(소수점 8자리까지)로 입력하세요.`);
  const n = normalizeDec(v);
  if (rule.kind === "rate" && cmpDec(n, "1") >= 0) throw bad(`${key}: 0 이상 1 미만이어야 합니다. (0.015% → 0.00015)`);
  if (rule.kind === "fraction" && (cmpDec(n, "0") <= 0 || cmpDec(n, "1") > 0))
    throw bad(`${key}: 0 초과 1 이하여야 합니다.`);
  if (rule.kind === "positive" && cmpDec(n, "0") <= 0) throw bad(`${key}: 0 보다 커야 합니다.`);
  if ((rule.kind === "positive" || rule.kind === "nonneg") && rule.max && cmpDec(n, rule.max) > 0)
    throw bad(`${key}: ${rule.max} 이하여야 합니다.`);
  return n;
}

function bad(message: string) {
  return new HttpError(400, "INVALID_SETTINGS", message);
}

/**
 * 덮어쓰기 값을 검증한다. base 는 엔진이 남긴 trader.env 기본값 (settings_effective.base).
 * null 이나 기본값과 같은 값은 "덮어쓰기 없음"으로 정리한다.
 */
export function validateOverrides(
  values: Record<string, unknown>,
  base: Record<string, string | null>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!(k in TUNABLE_RULES)) throw bad(`바꿀 수 없는 설정입니다: ${k}`);
    if (v == null || v === "") continue;
    if (typeof v !== "string") throw bad(`${k}: 문자열로 보내야 합니다.`);
    const n = checkValue(k, v);
    const b = base[k];
    const same = b != null && (TUNABLE_RULES[k].kind === "enum" ? b === n : DEC.test(b) && cmpDec(b, n) === 0);
    if (!same) out[k] = n;
  }
  const merged = (k: string) => out[k] ?? base[k];
  const order = merged("strategy_order_value");
  const maxOrder = merged("risk_max_order_value");
  const maxPos = merged("risk_max_position_value");
  if (order && maxOrder && cmpDec(order, maxOrder) > 0)
    throw bad("1회 매수 금액은 1회 주문 한도보다 클 수 없습니다.");
  if (maxOrder && maxPos && cmpDec(maxOrder, maxPos) > 0)
    throw bad("1회 주문 한도는 종목 보유 한도보다 클 수 없습니다.");
  return out;
}

// ── engine_state 읽기·쓰기 ──────────────────────────────────────────────────

type Json = Record<string, unknown>;

function parse(v: unknown): Json | null {
  if (v == null) return null;
  if (typeof v === "object") return v as Json;
  try {
    return JSON.parse(String(v)) as Json;
  } catch {
    return null;
  }
}

async function lockState(tx: TraderTx, key: string): Promise<Json | null> {
  const rows = await tx.query<{ value: unknown }>(
    "SELECT `value` FROM engine_state WHERE `key` = ? FOR UPDATE",
    [key]
  );
  return parse(rows[0]?.value);
}

async function putState(tx: TraderTx, key: string, value: Json, by: string): Promise<void> {
  await tx.query(
    "INSERT INTO engine_state (`key`, `value`, updated_at, updated_by) VALUES (?, ?, UTC_TIMESTAMP(6), ?) AS new " +
      "ON DUPLICATE KEY UPDATE `value` = new.`value`, updated_at = new.updated_at, updated_by = new.updated_by",
    [key, JSON.stringify(value), by.slice(0, 64)]
  );
}

async function audit(tx: TraderTx, kind: string, detail: Json): Promise<void> {
  await tx.query("INSERT INTO risk_events (ts, kind, detail) VALUES (UTC_TIMESTAMP(6), ?, ?)", [
    kind,
    JSON.stringify(detail),
  ]);
}

export async function readState(key: string): Promise<Json | null> {
  const rows = await traderQuery<{ value: unknown }>("SELECT `value` FROM engine_state WHERE `key` = ?", [key]);
  return parse(rows[0]?.value);
}

// ── 조작 ────────────────────────────────────────────────────────────────────

/** 긴급 정지: 신규 주문 차단 + 엔진이 미체결을 일괄 취소한다. 코드 없이 가능 (위험을 줄이는 방향). */
export async function halt(reason: string, by: string): Promise<void> {
  const r = reason.trim().slice(0, 200) || "화면에서 긴급 정지";
  await withTraderTx(async (tx) => {
    await lockState(tx, KILLSWITCH);
    await putState(tx, KILLSWITCH, { halted: true, reason: r, at: new Date().toISOString() }, by);
    await audit(tx, "HALT", { reason: r, by });
  });
}

/** 재개 (킬스위치 해제). 호출하기 전에 2단계 인증을 확인한다. */
export async function resume(by: string, note: string): Promise<void> {
  await withTraderTx(async (tx) => {
    const cur = await lockState(tx, KILLSWITCH);
    if (!cur?.halted) throw new HttpError(409, "NOT_HALTED", "엔진이 중지 상태가 아닙니다.");
    await putState(tx, KILLSWITCH, { halted: false, at: new Date().toISOString() }, by);
    await audit(tx, "RESUME", { by, note: note.trim().slice(0, 200) || null, previous: cur.reason ?? null });
  });
}

async function knownStrategies(): Promise<string[]> {
  const eff = await readState(EFFECTIVE);
  const list = (eff?.info as { strategies?: { id: string }[] } | undefined)?.strategies;
  return Array.isArray(list) ? list.map((s) => String(s.id)) : [];
}

/** 전략 켜기·끄기. 켜기는 호출하기 전에 2단계 인증을 확인한다. */
export async function setStrategy(id: string, enabled: boolean, by: string): Promise<void> {
  const known = await knownStrategies();
  if (!known.includes(id)) throw new HttpError(404, "UNKNOWN_STRATEGY", "엔진에 없는 전략입니다.");
  await withTraderTx(async (tx) => {
    const cur = (await lockState(tx, SWITCHES)) ?? {};
    const values = { ...((cur.values as Record<string, boolean>) ?? {}), [id]: enabled };
    const version = Number(cur.version ?? 0) + 1;
    await putState(tx, SWITCHES, { version, values, by, at: new Date().toISOString() }, by);
    await audit(tx, enabled ? "STRATEGY_ON" : "STRATEGY_OFF", { strategy: id, by });
  });
}

/**
 * 설정 덮어쓰기 전체를 바꾼다 (보내지 않은 항목은 trader.env 기본값으로 돌아간다).
 * 엔진이 다시 검증하고, 통과하면 다음 판단부터 적용한다. 호출하기 전에 2단계 인증을 확인한다.
 */
export async function updateSettings(
  values: Record<string, unknown>,
  by: string
): Promise<{ version: number; overrides: Record<string, string> }> {
  const eff = await readState(EFFECTIVE);
  const base = eff?.base as Record<string, string | null> | undefined;
  if (!base) {
    throw new HttpError(409, "ENGINE_NOT_READY", "엔진이 아직 설정을 기록하지 않았습니다. 엔진을 한 번 기동한 뒤 바꿀 수 있습니다.");
  }
  const overrides = validateOverrides(values, base);
  return withTraderTx(async (tx) => {
    const cur = (await lockState(tx, OVERRIDES)) ?? {};
    const version = Number(cur.version ?? 0) + 1;
    await putState(tx, OVERRIDES, { version, values: overrides, by, at: new Date().toISOString() }, by);
    await audit(tx, "SETTINGS_CHANGE", { version, by, before: cur.values ?? {}, after: overrides });
    return { version, overrides };
  });
}
