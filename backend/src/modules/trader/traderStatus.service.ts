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

/** KST 평일 09:00~15:30 (휴장일은 모른다 — 경고에만 쓴다) */
export function isMarketHours(now: Date): boolean {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const day = kst.getUTCDay();
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return day >= 1 && day <= 5 && minutes >= 9 * 60 && minutes < 15 * 60 + 30;
}

async function states(): Promise<Map<string, { value: Json | null; updatedAt: string | null; updatedBy: string | null }>> {
  const rows = await traderQuery<Row>(
    "SELECT `key`, `value`, updated_at, updated_by FROM engine_state WHERE `key` IN " +
      "('heartbeat', 'killswitch', 'strategy_switches', 'settings_overrides', 'settings_effective')"
  );
  return new Map(
    rows.map((r) => [
      String(r.key),
      { value: parse(r.value), updatedAt: utcIso(str(r.updated_at)), updatedBy: str(r.updated_by) },
    ])
  );
}

function settingsState(eff: Json | null, overrides: Json | null): TraderSettingsState | null {
  if (!eff) return null;
  const applied = Number(eff.applied_version ?? 0);
  const rejected = eff.rejected as { version?: number; reason?: string; at?: string } | null;
  const ovVersion = Number(overrides?.version ?? 0);
  const pending =
    overrides && ovVersion > applied && rejected?.version !== ovVersion
      ? { version: ovVersion, values: (overrides.values as Record<string, string>) ?? {}, at: iso(overrides.at) }
      : null;
  return {
    base: (eff.base as Record<string, string | null>) ?? {},
    effective: (eff.effective as Record<string, string | null>) ?? {},
    overrides: (eff.overrides as Record<string, string>) ?? {},
    appliedVersion: applied,
    pending,
    rejected: rejected?.version
      ? { version: Number(rejected.version), reason: String(rejected.reason ?? ""), at: iso(rejected.at) }
      : null,
    info: (eff.info as Record<string, unknown>) ?? null,
  };
}

export async function getStatus(now = new Date()): Promise<TraderStatus> {
  const st = await states();
  const hb = st.get("heartbeat")?.value ?? null;
  const kill = st.get("killswitch");
  const killValue = kill?.value ?? null;
  const switchesDoc = st.get("strategy_switches")?.value ?? null;
  const settings = settingsState(st.get("settings_effective")?.value ?? null, st.get("settings_overrides")?.value ?? null);

  const [lastQuote] = await traderQuery<Row>("SELECT MAX(ts) AS t FROM quotes");
  const lastQuoteAt = utcIso(str(lastQuote?.t));

  const heartbeatAt = iso(hb?.at);
  const age = heartbeatAt ? now.getTime() - new Date(heartbeatAt).getTime() : null;
  const state = heartbeatAt == null ? "unknown" : age! > HEARTBEAT_STALE_MS ? "stale" : "running";
  const marketOpen = isMarketHours(now);
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
  if (marketOpen && state === "running") {
    const q = lastQuoteAt ? now.getTime() - new Date(lastQuoteAt).getTime() : Infinity;
    if (q > QUOTE_STALE_MS) alerts.push({ level: "warn", code: "QUOTE_STALE", message: "장중인데 시세가 1분 넘게 들어오지 않았습니다 (stocksim 연결 확인)." });
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
    switches: Object.fromEntries(
      Object.entries((switchesDoc?.values as Record<string, unknown>) ?? {}).map(([k, v]) => [k, Boolean(v)])
    ),
    settings,
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
  const points = rows
    .map((r) => ({ date: String(r.trade_date).slice(0, 10), equity: String(r.start_equity) }))
    .reverse();
  const series = [...points.map((p) => p.equity), ...(currentEquity != null ? [currentEquity] : [])];
  if (series.length < 2) return { points, mdd: series.length ? "0" : null };
  const union = series.map((_, i) => `SELECT ${i} AS i, CAST(? AS DECIMAL(24,4)) AS e`).join(" UNION ALL ");
  const [row] = await traderQuery<Row>(
    `SELECT ROUND(MIN((e - peak) / peak), 6) AS mdd FROM (
       SELECT e, MAX(e) OVER (ORDER BY i ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS peak
         FROM (${union}) s
     ) x WHERE peak > 0`,
    series
  );
  return { points, mdd: str(row?.mdd) };
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
const INFO_EVENTS = new Set(["RESUME", "STRATEGY_ON", "STRATEGY_OFF", "SETTINGS_CHANGE", "SETTINGS_APPLIED"]);

const EVENT_TEXT: Record<string, string> = {
  HALT: "긴급 정지",
  RESUME: "재개",
  STRATEGY_ON: "전략 켬",
  STRATEGY_OFF: "전략 끔",
  SETTINGS_CHANGE: "설정 변경 요청",
  SETTINGS_APPLIED: "설정 적용",
  SETTINGS_REJECTED: "설정 거부",
  DATA_INVALID: "잘못된 시세",
  DATA_GAP: "봉 누락",
  CANCEL_FAILED: "주문 취소 실패",
  FATAL: "엔진 중단",
  ENGINE_ERROR: "엔진 오류",
};

function eventMessage(kind: string, detail: Json | null): string {
  const label = EVENT_TEXT[kind] ?? kind;
  if (!detail) return label;
  const parts: string[] = [];
  for (const k of ["strategy", "reason", "by", "err", "missing", "version"]) {
    if (detail[k] != null) parts.push(`${k === "by" ? "by " : ""}${String(detail[k])}`);
  }
  if (detail.diff && typeof detail.diff === "object") {
    parts.push(Object.entries(detail.diff as Record<string, [string, string]>).map(([k, [a, b]]) => `${k} ${a}→${b}`).join(", "));
  }
  return parts.length ? `${label} · ${parts.join(" · ")}`.slice(0, 300) : label;
}

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
    ...fills.map((f): TraderActivity => ({
      id: `fill-${String(f.id)}`,
      ts: utcIso(str(f.ts)),
      level: "info",
      source: "fill",
      kind: String(f.side),
      symbol: str(f.symbol),
      message: `${f.side === "BUY" ? "매수" : "매도"} 체결 ${String(f.qty)}주 @ ${String(f.price)}${f.strategy_id ? ` · ${String(f.strategy_id)}` : ""}`,
    })),
    ...orders.map((o): TraderActivity => ({
      id: `order-${String(o.id)}`,
      ts: utcIso(str(o.updated_at)),
      level: o.status === "REJECTED" ? "warn" : "info",
      source: "order",
      kind: String(o.status),
      symbol: str(o.symbol),
      message: `${o.status === "REJECTED" ? "주문 거부" : "주문 취소"} ${o.side === "BUY" ? "매수" : "매도"} ${String(o.qty)}주${o.reject_reason ? ` · ${String(o.reject_reason)}` : ""}`,
    })),
    ...events.map((e): TraderActivity => {
      const kind = String(e.kind);
      return {
        id: `event-${String(e.id)}`,
        ts: utcIso(str(e.ts)),
        level: ERROR_EVENTS.has(kind) ? "error" : INFO_EVENTS.has(kind) ? "info" : "warn",
        source: "event",
        kind,
        symbol: str(e.symbol),
        message: eventMessage(kind, parse(e.detail)),
      };
    }),
  ];
  out.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
  return out.slice(0, limit);
}
