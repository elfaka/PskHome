import { HttpError } from "../../lib/httpError.js";
import { traderQuery, withTraderTx, type TraderTx } from "./traderDb.js";

/**
 * 화면 제어 — 엔진 DB 의 engine_state 에 쓰고, 엔진이 감시 루프(약 5초)에서 읽어 반영한다.
 * 엔진과 직접 통신하지 않는다. 형식은 trader/src/trader/control.py · risk/killswitch.py 와 같아야 한다.
 *
 * 쓰는 곳은 engine_state(INSERT·UPDATE)와 risk_events(INSERT, 조작 기록)뿐이다.
 * 금액·비율은 문자열 그대로 검증·저장한다 (JS number 로 바꾸지 않는다).
 *
 * 운영 설정(수수료·한도·진입 마감 등)의 원본은 engine_state `settings` 다 (trader.env 가 아니다).
 *   settings = { version, values: {키: "문자열" | null}, by, at, previous: { version, values } | null }
 * 엔진이 처음 기동할 때 trader.env 값을 옮겨 version 1 을 만든다. 그 전에는 저장할 수 없다 (409 ENGINE_NOT_READY).
 */

const KILLSWITCH = "killswitch";
const SWITCHES = "strategy_switches";
const SETTINGS = "settings";
const EFFECTIVE = "settings_effective";

type Rule =
  | { kind: "rate" } // 0 이상 1 미만
  | { kind: "fraction" } // 0 초과 1 이하
  | { kind: "nonneg"; max?: string }
  | { kind: "positive"; max?: string }
  | { kind: "enum"; values: string[] }
  | { kind: "time" }; // "HH:MM[:SS]" (KST) 또는 null = 끔

/** DB 에 두고 화면에서 바꾸는 운영 설정. trader/src/trader/control.py 의 TUNABLE 과 같아야 한다. */
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
  entry_cutoff: { kind: "time" },
  eod_exit: { kind: "time" },
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

const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

/** "9:05" 는 받지 않는다. "15:00" → "15:00:00" */
export function normalizeTime(v: string): string | null {
  const m = TIME.exec(v.trim());
  return m ? `${m[1]}:${m[2]}:${m[3] ?? "00"}` : null;
}

function checkValue(key: string, raw: string): string {
  const rule = TUNABLE_RULES[key];
  if (rule.kind === "time") {
    const t = normalizeTime(raw);
    if (!t) throw bad(`${key}: 시각은 HH:MM 형식으로 입력하세요 (예: 15:00).`);
    return t;
  }
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

export type SettingsValues = Record<string, string | null>;

/** 바꿀 값(changes)을 지금 값(current)에 합쳐 전체를 검증한다. 시각은 null 이면 끔. */
export function validateSettings(
  changes: Record<string, unknown>,
  current: SettingsValues,
  hours: { open?: string | null; close?: string | null } = {}
): SettingsValues {
  const next: SettingsValues = {};
  for (const k of TUNABLE_KEYS) next[k] = current[k] ?? null;
  for (const [k, v] of Object.entries(changes)) {
    if (!(k in TUNABLE_RULES)) throw bad(`바꿀 수 없는 설정입니다: ${k}`);
    const rule = TUNABLE_RULES[k];
    if (v == null || v === "") {
      if (rule.kind !== "time") throw bad(`${k}: 값이 필요합니다.`);
      next[k] = null;
      continue;
    }
    if (typeof v !== "string") throw bad(`${k}: 문자열로 보내야 합니다.`);
    next[k] = checkValue(k, v);
  }
  for (const k of TUNABLE_KEYS) {
    if (TUNABLE_RULES[k].kind !== "time" && next[k] == null) throw bad(`${k}: 값이 없습니다.`);
  }

  const order = next.strategy_order_value!;
  const maxOrder = next.risk_max_order_value!;
  const maxPos = next.risk_max_position_value!;
  if (cmpDec(order, maxOrder) > 0) throw bad("1회 매수 금액은 1회 주문 한도보다 클 수 없습니다.");
  if (cmpDec(maxOrder, maxPos) > 0) throw bad("1회 주문 한도는 종목 보유 한도보다 클 수 없습니다.");

  // 장 시작 ≤ 신규 매수 마감 ≤ 장마감 청산 ≤ 장 마감 (HH:MM:SS 문자열은 사전순 = 시각순)
  const open = normalizeTime(hours.open ?? "") ?? "09:00:00";
  const close = normalizeTime(hours.close ?? "") ?? "15:30:00";
  for (const [k, label] of [
    ["entry_cutoff", "신규 매수 마감"],
    ["eod_exit", "장마감 청산"],
  ] as const) {
    const t = next[k];
    if (t != null && (t < open || t > close))
      throw bad(`${label} 시각은 장 시간(${open.slice(0, 5)}~${close.slice(0, 5)}) 안이어야 합니다.`);
  }
  if (next.entry_cutoff != null && next.eod_exit != null && next.entry_cutoff > next.eod_exit)
    throw bad("신규 매수 마감은 장마감 청산보다 늦을 수 없습니다.");
  return next;
}

function sameValue(k: string, a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  const kind = TUNABLE_RULES[k]?.kind;
  if (kind === "enum" || kind === "time" || !DEC.test(a) || !DEC.test(b)) return a === b;
  return cmpDec(a, b) === 0;
}

/** 바뀐 항목만 [전, 후] */
export function diffSettings(before: SettingsValues, after: SettingsValues): Record<string, [string | null, string | null]> {
  const out: Record<string, [string | null, string | null]> = {};
  for (const k of TUNABLE_KEYS) {
    if (!sameValue(k, before[k], after[k])) out[k] = [before[k] ?? null, after[k] ?? null];
  }
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

async function marketHours(): Promise<{ open: string | null; close: string | null }> {
  const info = (await readState(EFFECTIVE))?.info as { market_open?: string; market_close?: string } | undefined;
  return { open: info?.market_open ?? null, close: info?.market_close ?? null };
}

function notReady() {
  return new HttpError(
    409,
    "ENGINE_NOT_READY",
    "엔진이 아직 운영 설정을 DB 로 옮기지 않았습니다. 새 엔진이 한 번 기동하면(trader.env 값을 옮긴 뒤) 바꿀 수 있습니다."
  );
}

/**
 * 운영 설정을 바꾼다. 보낸 항목만 바꾸고 나머지는 지금 값을 유지한 채 전체를 검증해 새 버전으로 저장한다.
 * 엔진이 다시 검증하고, 통과하면 다음 판단부터 적용한다. 호출하기 전에 2단계 인증을 확인한다.
 */
export async function updateSettings(
  changes: Record<string, unknown>,
  by: string
): Promise<{ version: number; values: SettingsValues }> {
  const hours = await marketHours();
  return withTraderTx(async (tx) => {
    const cur = await lockState(tx, SETTINGS);
    if (!cur) throw notReady();
    const before = (cur.values as SettingsValues) ?? {};
    const next = validateSettings(changes, before, hours);
    const diff = diffSettings(before, next);
    if (Object.keys(diff).length === 0) throw new HttpError(400, "NO_CHANGE", "바뀐 값이 없습니다.");
    const version = Number(cur.version ?? 0) + 1;
    await putState(
      tx,
      SETTINGS,
      { version, values: next, by, at: new Date().toISOString(), previous: { version: Number(cur.version ?? 0), values: before } },
      by
    );
    await audit(tx, "SETTINGS_CHANGE", { version, by, diff });
    return { version, values: next };
  });
}

/** 직전 설정으로 되돌린다 (그 값을 새 버전으로 저장). 호출하기 전에 2단계 인증을 확인한다. */
export async function revertSettings(by: string): Promise<{ version: number; values: SettingsValues; restored: number }> {
  const hours = await marketHours();
  return withTraderTx(async (tx) => {
    const cur = await lockState(tx, SETTINGS);
    if (!cur) throw notReady();
    const prev = cur.previous as { version?: number; values?: SettingsValues } | null | undefined;
    if (!prev?.values) throw new HttpError(409, "NO_PREVIOUS", "되돌릴 직전 설정이 없습니다.");
    const before = (cur.values as SettingsValues) ?? {};
    const next = validateSettings(prev.values, before, hours);
    const version = Number(cur.version ?? 0) + 1;
    const restored = Number(prev.version ?? 0);
    await putState(
      tx,
      SETTINGS,
      { version, values: next, by, at: new Date().toISOString(), previous: { version: Number(cur.version ?? 0), values: before } },
      by
    );
    await audit(tx, "SETTINGS_REVERT", { version, by, restored, diff: diffSettings(before, next) });
    return { version, values: next, restored };
  });
}
