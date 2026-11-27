import { traderQuery, utcIso } from "./traderDb.js";
import type {
  TraderActivity,
  TraderAlert,
  TraderEquity,
  TraderSettingsState,
  TraderStatus,
  TraderStrategyRow,
} from "./trader.types.js";

/**
 * 상단 상태 바 · 전략 목록 · 평가금액 추이 · 활동 로그 — 엔진 DB 를 읽기만 한다.
 * 엔진 상태 신호(heartbeat)는 감시 주기(기본 5초)마다 갱신된다.
 */

type Row = Record<string, unknown>;
type Json = Record<string, unknown>;

const str = (v: unknown): string | null => (v == null ? null : String(v));

/** "13.000000" → "13", "74062.5000" → "74062.5" (표시용, 문자열 연산) */
export function plain(v: unknown): string {
  const s = String(v ?? "");
  return /^-?\d+\.\d+$/.test(s) ? s.replace(/\.?0+$/, "") : s;
}

/** 상태 신호가 이보다 오래되면 "응답 없음" */
export const HEARTBEAT_STALE_MS = 30_000;
/** 장중 시세가 이보다 오래되면 경고 */
export const QUOTE_STALE_MS = 60_000;

function parse(v: unknown): Json | null {
  if (v == null) return null;
  if (typeof v === "object") return v as Json;
  try {
    return JSON.parse(String(v)) as Json;
  } catch {
    return null;
  }
}

/** ISO(오프셋 포함) → UTC ISO. 엔진은 isoformat() 으로 남긴다 */
function iso(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * 한국거래소 장 구간 (KST 평일, 휴장일은 모른다 — 화면 표시·경고에만 쓴다)
 * - continuous: 09:00~15:20 정규장 (체결이 계속 들어온다)
 * - closing_auction: 15:20~15:30 장 마감 동시호가 — 체결 없이 호가만 쌓이다 15:30 에 한 번에 체결된다
 * - closed: 그 밖
 */
export type MarketPhase = "continuous" | "closing_auction" | "closed";

export function marketPhase(now: Date): MarketPhase {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const day = kst.getUTCDay();
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  if (day < 1 || day > 5) return "closed";
  if (minutes >= 9 * 60 && minutes < 15 * 60 + 20) return "continuous";
  if (minutes >= 15 * 60 + 20 && minutes < 15 * 60 + 30) return "closing_auction";
  return "closed";
}

/** KST 평일 09:00~15:30 (마감 동시호가 포함) */
export function isMarketHours(now: Date): boolean {
  return marketPhase(now) !== "closed";
}

async function states(): Promise<Map<string, { value: Json | null; updatedAt: string | null; updatedBy: string | null }>> {
  const rows = await traderQuery<Row>(
    "SELECT `key`, `value`, updated_at, updated_by FROM engine_state WHERE `key` IN " +
      "('heartbeat', 'killswitch', 'strategy_switches', 'settings', 'settings_effective', 'universe')"
  );
  return new Map(
    rows.map((r) => [
      String(r.key),
      { value: parse(r.value), updatedAt: utcIso(str(r.updated_at)), updatedBy: str(r.updated_by) },
    ])
  );
}

/** 운영 설정 상태 — 원본은 engine_state `settings`(DB), 엔진 적용 결과는 `settings_effective` */
function settingsState(eff: Json | null, doc: Json | null): TraderSettingsState | null {
  if (!eff && !doc) return null;
  const effective = (eff?.effective as Record<string, string | null>) ?? {};
  const applied = Number(eff?.applied_version ?? 0);
  const rejected = eff?.rejected as { version?: number; reason?: string; at?: string } | null | undefined;
  const saved = Number(doc?.version ?? 0);
  const prev = doc?.previous as { version?: number; values?: unknown } | null | undefined;
  return {
    ready: doc != null,
    values: (doc?.values as Record<string, string | null>) ?? effective,
    effective,
    savedVersion: saved,
    savedAt: iso(doc?.at),
    savedBy: str(doc?.by),
    appliedVersion: applied,
    pending: doc && saved > applied && rejected?.version !== saved ? { version: saved, at: iso(doc.at) } : null,
    rejected: rejected?.version
      ? { version: Number(rejected.version), reason: String(rejected.reason ?? ""), at: iso(rejected.at) }
      : null,
    previousVersion: prev?.values ? Number(prev.version ?? 0) : null,
    envIgnored: Array.isArray(eff?.env_ignored) ? (eff.env_ignored as unknown[]).map(String) : [],
    info: (eff?.info as Record<string, unknown>) ?? null,
  };
}

/** 오늘 볼 종목 (엔진 engine_state universe) + 지금 실제로 보는 종목 (선정 밖 보유 종목 포함) */
function universeState(doc: Json | null, settings: TraderSettingsState | null): TraderStatus["universe"] {
  const watching = ((settings?.info as Json | null)?.symbols as unknown[] | undefined)?.map(String) ?? [];
  if (!doc && watching.length === 0) return null;
  const picks = Array.isArray(doc?.symbols) ? (doc!.symbols as Json[]) : [];
  return {
    date: str(doc?.date),
    mode: str(doc?.mode),
    source: str(doc?.source),
    at: iso(doc?.at),
    symbols: picks.map((p) => ({
      symbol: String(p.symbol ?? ""),
      name: str(p.name),
      score: str(p.score),
      foreigner: str(p.foreigner),
      institution: str(p.institution),
      pinned: Boolean(p.pinned),
    })),
    excluded: (Array.isArray(doc?.excluded) ? (doc!.excluded as Json[]) : []).slice(0, 30).map((e) => ({
      symbol: String(e.symbol ?? ""),
      name: str(e.name),
      reason: String(e.reason ?? ""),
    })),
    watching,
  };
}

export async function getStatus(now = new Date()): Promise<TraderStatus> {
  const st = await states();
  const hb = st.get("heartbeat")?.value ?? null;
  const kill = st.get("killswitch");
  const killValue = kill?.value ?? null;
  const switchesDoc = st.get("strategy_switches")?.value ?? null;
  const settings = settingsState(st.get("settings_effective")?.value ?? null, st.get("settings")?.value ?? null);

  // 엔진은 시세를 모아서(기본 200건) 기록하므로 DB 보다 상태 신호의 마지막 시세 시각이 더 최신이다
  const hbQuotes = Object.values((hb?.last_quote_at as Record<string, string>) ?? {})
    .map(iso)
    .filter((v): v is string => v != null)
    .sort();
  const [lastQuote] = await traderQuery<Row>("SELECT MAX(ts) AS t FROM quotes");
  const dbQuoteAt = utcIso(str(lastQuote?.t));
  const lastQuoteAt = [hbQuotes.at(-1), dbQuoteAt].filter((v): v is string => v != null).sort().at(-1) ?? null;

  const heartbeatAt = iso(hb?.at);
  const age = heartbeatAt ? now.getTime() - new Date(heartbeatAt).getTime() : null;
  const state = heartbeatAt == null ? "unknown" : age! > HEARTBEAT_STALE_MS ? "stale" : "running";
  const phase = marketPhase(now);
  const marketOpen = phase !== "closed";
  // 킬스위치 상태를 읽지 못하는 경우는 없다 (행이 없으면 엔진도 "꺼짐 아님"으로 본다)
  const halted = Boolean(killValue?.halted);

  const alerts: TraderAlert[] = [];
  if (halted) alerts.push({ level: "error", code: "HALTED", message: `긴급 정지 상태입니다 — ${String(killValue?.reason ?? "사유 없음")}` });
  if (state === "stale") alerts.push({ level: "error", code: "ENGINE_STALE", message: "엔진 상태 신호가 30초 넘게 없습니다. 엔진이 멈췄을 수 있습니다." });
  if (state === "unknown") alerts.push({ level: "warn", code: "ENGINE_UNKNOWN", message: "엔진 상태 신호가 아직 없습니다 (엔진을 새 버전으로 기동하면 나타납니다)." });
  if (hb && hb.db_ok === false) alerts.push({ level: "error", code: "ENGINE_DB", message: "엔진이 DB 오류를 보고했습니다. 신규 주문이 막혀 있습니다." });
  const dataIssues = (hb?.data_issues as Record<string, string>) ?? {};
  for (const [sym, why] of Object.entries(dataIssues)) {
    alerts.push({ level: "warn", code: "DATA_ISSUE", message: `${sym}: ${why}` });
  }
  // 정규장에서만 본다. 마감 동시호가(15:20~15:30)에는 원래 체결이 없다.
  // 마지막 시세는 모든 종목 중 가장 최근 것이라, 한 종목의 VI(약 2분 단일가)로는 울리지 않는다
  if (phase === "continuous" && state === "running") {
    const q = lastQuoteAt ? now.getTime() - new Date(lastQuoteAt).getTime() : Infinity;
    if (q > QUOTE_STALE_MS)
      alerts.push({
        level: "warn",
        code: "QUOTE_STALE",
        message: "정규장(09:00~15:20)인데 시세가 1분 넘게 들어오지 않았습니다 (stocksim 연결 확인).",
      });
  }
  if (settings?.rejected) alerts.push({ level: "warn", code: "SETTINGS_REJECTED", message: `엔진이 설정 변경을 거부했습니다: ${settings.rejected.reason}` });

  const lastQuoteBySymbol: Record<string, string> = {};
  for (const [sym, t] of Object.entries((hb?.last_quote_at as Record<string, string>) ?? {})) {
    const v = iso(t);
    if (v) lastQuoteBySymbol[sym] = v;
  }

  return {
    serverTime: now.toISOString(),
    engine: {
      state,
      heartbeatAt,
      startedAt: iso(hb?.started_at),
      mode: str(hb?.mode) ?? str((settings?.info as Json | null)?.mode),
      feed: str(hb?.feed) ?? str((settings?.info as Json | null)?.feed),
      dbOk: typeof hb?.db_ok === "boolean" ? hb.db_ok : null,
      dataIssues,
    },
    killswitch: {
      halted,
      reason: halted ? str(killValue?.reason) : null,
      updatedAt: kill?.updatedAt ?? null,
      updatedBy: kill?.updatedBy ?? null,
    },
    lastQuoteAt,
    lastQuoteBySymbol,
    marketOpen,
    marketPhase: phase,
    switches: Object.fromEntries(
      Object.entries((switchesDoc?.values as Record<string, unknown>) ?? {}).map(([k, v]) => [k, Boolean(v)])
    ),
    settings,
    universe: universeState(st.get("universe")?.value ?? null, settings),
    alerts,
  };
}

/** 일별 시작 평가금액 + 현재 총자산, 최대 낙폭(SQL 창 함수로 계산). */
export async function getEquity(accountName: string, currentEquity: string | null, days = 120): Promise<TraderEquity> {
  const rows = await traderQuery<Row>(
    `SELECT d.trade_date, d.start_equity FROM daily_equity d JOIN accounts a ON a.id = d.account_id
      WHERE a.name = ? ORDER BY d.trade_date DESC LIMIT ?`,
    [accountName, days]
  );
  const daily = rows.map((r) => ({ date: String(r.trade_date).slice(0, 10), equity: String(r.start_equity) })).reverse();
  const series = [...daily.map((p) => p.equity), ...(currentEquity != null ? [currentEquity] : [])];
  if (series.length === 0) return { points: [], mdd: null, current: null };
  // 점마다 그때까지 최고점 대비 하락폭 (SQL DECIMAL, 창 함수)
  const union = series.map((_, i) => `SELECT ${i} AS i, CAST(? AS DECIMAL(24,4)) AS e`).join(" UNION ALL ");
  const dd = await traderQuery<Row>(
    `SELECT i, CASE WHEN peak > 0 THEN ROUND((e - peak) / peak, 6) END AS dd FROM (
       SELECT i, e, MAX(e) OVER (ORDER BY i ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS peak
         FROM (${union}) s
     ) x ORDER BY i`,
    series
  );
  const ddAt = (i: number) => str(dd.find((r) => Number(r.i) === i)?.dd);
  const points = daily.map((p, i) => ({ ...p, drawdown: ddAt(i) }));
  const current = currentEquity != null ? { equity: currentEquity, drawdown: ddAt(series.length - 1) } : null;
  if (series.length < 2) return { points, mdd: "0", current };
  const [row] = await traderQuery<Row>(
    `SELECT ROUND(MIN((e - peak) / peak), 6) AS mdd FROM (
       SELECT e, MAX(e) OVER (ORDER BY i ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS peak
         FROM (${union}) s
     ) x WHERE peak > 0`,
    series
  );
  return { points, mdd: str(row?.mdd), current };
}

const TODAY_UTC =
  "CONVERT_TZ(DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+09:00')), '+09:00', '+00:00')";

export async function getStrategies(recentPerStrategy = 40): Promise<TraderStrategyRow[]> {
  const st = await states();
  const eff = st.get("settings_effective")?.value ?? null;
  const switches = (st.get("strategy_switches")?.value?.values as Record<string, unknown>) ?? {};
  let list = ((eff?.info as Json | undefined)?.strategies as { id: string; shadow: boolean }[] | undefined) ?? [];

  const counts = await traderQuery<Row>(
    `SELECT strategy_id,
            COUNT(*) AS decisions,
            SUM(action IN ('BUY','SELL','EXIT')) AS signals,
            SUM(risk_result = 'APPROVED') AS orders,
            SUM(risk_result = 'REJECTED') AS rejected,
            MAX(ts) AS last_ts
       FROM strategy_decisions WHERE ts >= ${TODAY_UTC} GROUP BY strategy_id`
  );
  const fills = await traderQuery<Row>(
    `SELECT o.strategy_id, COUNT(*) AS n FROM fills f JOIN orders o ON o.id = f.order_id
      WHERE f.ts >= ${TODAY_UTC} GROUP BY o.strategy_id`
  );
  if (list.length === 0) {
    // 엔진이 아직 설정을 남기지 않았으면 오늘 판단한 전략으로 대신한다
    list = counts.map((c) => ({ id: String(c.strategy_id), shadow: false }));
  }
  const ids = list.map((s) => s.id);
  const recent = ids.length
    ? await traderQuery<Row>(
        `SELECT strategy_id, ts, symbol, action, risk_result FROM (
           SELECT strategy_id, ts, symbol, action, risk_result,
                  ROW_NUMBER() OVER (PARTITION BY strategy_id ORDER BY id DESC) AS rn
             FROM strategy_decisions WHERE strategy_id IN (${ids.map(() => "?").join(",")})
         ) x WHERE rn <= ? ORDER BY strategy_id, ts`,
        [...ids, recentPerStrategy]
      )
    : [];

  return list.map((s) => {
    const c = counts.find((r) => r.strategy_id === s.id);
    return {
      id: s.id,
      shadow: Boolean(s.shadow),
      enabled: switches[s.id] === undefined ? true : Boolean(switches[s.id]),
      today: {
        decisions: Number(c?.decisions ?? 0),
        signals: Number(c?.signals ?? 0),
        orders: Number(c?.orders ?? 0),
        rejected: Number(c?.rejected ?? 0),
        fills: Number(fills.find((f) => f.strategy_id === s.id)?.n ?? 0),
      },
      lastDecisionAt: utcIso(str(c?.last_ts)),
      recent: recent
        .filter((r) => r.strategy_id === s.id)
        .map((r) => ({ ts: utcIso(str(r.ts)), symbol: String(r.symbol), action: String(r.action), riskResult: str(r.risk_result) })),
    };
  });
}

const ERROR_EVENTS = new Set(["FATAL", "ENGINE_ERROR", "CANCEL_FAILED", "HALT", "RECOVERY_MISMATCH"]);
const INFO_EVENTS = new Set([
  "RESUME",
  "STRATEGY_ON",
  "STRATEGY_OFF",
  "SETTINGS_CHANGE",
  "SETTINGS_REVERT",
  "SETTINGS_APPLIED",
  "SETTINGS_SEEDED",
  "UNIVERSE_SELECTED",
  "RECOVERED",
]);

/** "1234567.5000" → "1,234,567.5" (표시용, 문자열 연산) */
export function groupNum(v: unknown): string {
  const t = plain(v);
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(t);
  return m ? `${m[1]}${m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${m[3] ?? ""}` : t;
}

type EventText = Pick<TraderActivity, "category" | "title" | "detail" | "code" | "strategyId" | "by" | "diff"> & { group?: string };

function diffOf(detail: Json): TraderActivity["diff"] {
  // 지금 형식 {키: [전, 후]}, 예전 형식 {before: {...}, after: {...}}
  if (detail.diff && typeof detail.diff === "object") {
    return Object.entries(detail.diff as Record<string, unknown>).map(([key, v]) => {
      const [a, b] = Array.isArray(v) ? v : [null, null];
      return { key, before: a == null ? null : String(a), after: b == null ? null : String(b) };
    });
  }
  const before = (detail.before as Record<string, unknown> | undefined) ?? null;
  const after = (detail.after as Record<string, unknown> | undefined) ?? null;
  if (before || after) {
    const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
    return keys.map((key) => ({
      key,
      before: before?.[key] == null ? null : String(before[key]),
      after: after?.[key] == null ? null : String(after[key]),
    }));
  }
  return null;
}

function by(detail: Json | null): string | null {
  return detail?.by == null ? null : String(detail.by);
}

/** 위험 이벤트 → 한글 제목·내용 */
export function describeEvent(kind: string, detail: Json | null): EventText {
  const d = detail ?? {};
  const base: EventText = { category: "system", title: kind, detail: null, code: null, strategyId: null, by: by(detail), diff: null };
  const version = d.version != null ? ` (v${String(d.version)})` : "";
  switch (kind) {
    case "HALT":
      return { ...base, category: "control", title: "긴급 정지", detail: d.reason ? `사유: ${String(d.reason)}` : null };
    case "RESUME":
      return { ...base, category: "control", title: "재개", detail: d.note ? `메모: ${String(d.note)}` : d.previous ? `정지 사유였던 것: ${String(d.previous)}` : null };
    case "STRATEGY_ON":
    case "STRATEGY_OFF":
      return {
        ...base,
        category: "control",
        title: kind === "STRATEGY_ON" ? "전략 켬" : "전략 끔",
        strategyId: d.strategy == null ? null : String(d.strategy),
        detail: kind === "STRATEGY_OFF" ? "신규 매수만 멈춥니다 (매도·청산은 계속)" : null,
      };
    case "SETTINGS_CHANGE":
      return { ...base, category: "settings", title: `설정 저장${version}`, detail: "엔진이 검증 후 적용합니다", diff: diffOf(d) };
    case "SETTINGS_REVERT":
      return {
        ...base,
        category: "settings",
        title: `직전 설정으로 되돌림${version}`,
        detail: d.restored != null ? `v${String(d.restored)} 의 값으로` : null,
        diff: diffOf(d),
      };
    case "SETTINGS_APPLIED":
      return { ...base, category: "settings", title: `엔진이 설정 적용${version}`, diff: diffOf(d) };
    case "SETTINGS_REJECTED":
      return { ...base, category: "settings", title: `엔진이 설정 거부${version}`, detail: d.reason ? `이전 값 유지 · ${String(d.reason)}` : "이전 값 유지" };
    case "SETTINGS_SEEDED": {
      const n = d.values && typeof d.values === "object" ? Object.keys(d.values as Json).length : null;
      return {
        ...base,
        category: "settings",
        title: "trader.env 설정을 DB 로 옮김",
        detail: `운영 설정${n != null ? ` ${n}개` : ""}를 처음 한 번 옮겼습니다. 이제 화면에서 바꿉니다`,
        by: "engine",
      };
    }
    case "UNIVERSE_SELECTED": {
      const syms = Array.isArray(d.symbols) ? (d.symbols as unknown[]).map(String) : [];
      return { ...base, category: "universe", title: `오늘의 종목 선정 (${syms.length}개)`, detail: syms.join(", ") || null, by: "engine" };
    }
    case "ORDER_REJECTED": {
      const code = d.code == null ? null : String(d.code);
      return {
        ...base,
        category: "risk",
        title: "위험 관리가 주문을 막음",
        detail: d.reason == null ? null : String(d.reason),
        code,
        group: `ORDER_REJECTED:${code ?? ""}`,
      };
    }
    case "DATA_INVALID":
      return { ...base, category: "data", title: "잘못된 시세를 무시함", detail: d.price != null ? `가격 ${groupNum(d.price)}` : null };
    case "DATA_GAP":
      return {
        ...base,
        category: "data",
        title: `봉 누락${d.missing != null ? ` ${String(d.missing)}개` : ""}`,
        detail: "지표를 다시 쌓는 동안 그 종목은 신규 매수를 하지 않습니다",
      };
    case "CANCEL_FAILED":
      return { ...base, category: "order", title: "주문 취소 실패", detail: [d.reason, d.err].filter(Boolean).map(String).join(" · ") || null };
    case "FATAL":
      return { ...base, category: "system", title: "엔진 중단", detail: d.err ? String(d.err) : null };
    case "ENGINE_ERROR":
      return { ...base, category: "system", title: "엔진 오류로 중단", detail: d.err ? String(d.err) : null };
    case "RECOVERED": {
      const pos = d.positions && typeof d.positions === "object" ? Object.keys(d.positions as Json).length : 0;
      const open = Array.isArray(d.open_orders) ? d.open_orders.length : 0;
      return {
        ...base,
        category: "system",
        title: "엔진 시작 · 상태 복구",
        detail: `현금 ${d.cash != null ? `${groupNum(d.cash)}원` : "—"} · 보유 ${pos}종목 · 미체결 ${open}건`,
        by: "engine",
      };
    }
    case "RECOVERY_MISMATCH": {
      const n = Array.isArray(d.mismatches) ? d.mismatches.length : null;
      return { ...base, category: "system", title: "복구 중 불일치 — 긴급 정지", detail: n != null ? `불일치 ${n}건 (확인 후 재개)` : null };
    }
    default:
      return base;
  }
}

const SIDE = (side: unknown) => (side === "BUY" ? "매수" : "매도");
const ORDER_STATUS: Record<string, string> = { REJECTED: "주문 거부", CANCELED: "주문 취소", EXPIRED: "주문 만료" };

/** 체결 · 주문 실패 · 위험 이벤트를 시간순으로 합친다 (최근 limit 건). */
export async function listActivity(accountName: string, limit: number): Promise<TraderActivity[]> {
  const fills = await traderQuery<Row>(
    `SELECT f.id, f.ts, f.symbol, f.side, f.qty, f.price, o.strategy_id
       FROM fills f JOIN orders o ON o.id = f.order_id JOIN accounts a ON a.id = o.account_id
      WHERE a.name = ? ORDER BY f.id DESC LIMIT ?`,
    [accountName, limit]
  );
  const orders = await traderQuery<Row>(
    `SELECT o.id, o.updated_at, o.symbol, o.side, o.qty, o.status, o.reject_reason, o.strategy_id
       FROM orders o JOIN accounts a ON a.id = o.account_id
      WHERE a.name = ? AND o.status IN ('REJECTED','CANCELED','EXPIRED') ORDER BY o.id DESC LIMIT ?`,
    [accountName, limit]
  );
  const events = await traderQuery<Row>(
    "SELECT id, ts, kind, symbol, detail FROM risk_events ORDER BY id DESC LIMIT ?",
    [limit]
  );

  const out: TraderActivity[] = [
    ...fills.map((f): TraderActivity => {
      const title = `${SIDE(f.side)} 체결`;
      const detail = `${groupNum(f.qty)}주 × ${groupNum(f.price)}원`;
      return {
        id: `fill-${String(f.id)}`,
        ts: utcIso(str(f.ts)),
        level: "info",
        source: "fill",
        kind: String(f.side),
        symbol: str(f.symbol),
        category: "trade",
        title,
        detail,
        code: null,
        strategyId: str(f.strategy_id),
        by: null,
        diff: null,
        groupKey: `fill-${String(f.id)}`,
        message: `${title} · ${detail}`,
      };
    }),
    ...orders.map((o): TraderActivity => {
      const title = `${ORDER_STATUS[String(o.status)] ?? String(o.status)} (${SIDE(o.side)})`;
      const detail = `${groupNum(o.qty)}주${o.reject_reason ? ` · ${String(o.reject_reason)}` : ""}`;
      return {
        id: `order-${String(o.id)}`,
        ts: utcIso(str(o.updated_at)),
        level: o.status === "REJECTED" ? "warn" : "info",
        source: "order",
        kind: String(o.status),
        symbol: str(o.symbol),
        category: "order",
        title,
        detail,
        code: null,
        strategyId: str(o.strategy_id),
        by: null,
        diff: null,
        groupKey: `order-${String(o.status)}-${String(o.symbol)}-${String(o.reject_reason ?? "")}`,
        message: `${title} · ${detail}`,
      };
    }),
    ...events.map((e): TraderActivity => {
      const kind = String(e.kind);
      const { group, ...t } = describeEvent(kind, parse(e.detail));
      const symbol = str(e.symbol);
      return {
        id: `event-${String(e.id)}`,
        ts: utcIso(str(e.ts)),
        level: ERROR_EVENTS.has(kind) ? "error" : INFO_EVENTS.has(kind) ? "info" : "warn",
        source: "event",
        kind,
        symbol,
        ...t,
        groupKey: group ? `${group}:${symbol ?? ""}` : `event-${String(e.id)}`,
        message: t.detail ? `${t.title} · ${t.detail}` : t.title,
      };
    }),
  ];
  out.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
  return out.slice(0, limit);
}
