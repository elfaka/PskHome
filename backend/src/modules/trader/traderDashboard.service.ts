import { traderQuery, utcIso } from "./traderDb.js";
import type {
  TraderDecision,
  TraderFill,
  TraderOrder,
  TraderPerformanceRow,
  TraderRiskEvent,
  TraderSummary,
} from "./trader.types.js";

/**
 * 자동매매 대시보드 — 엔진 DB 를 읽기만 한다.
 * 금액 계산(평가금액·손익)은 SQL DECIMAL 로 한다. JS number 로 바꾸지 않는다.
 */

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (v == null ? null : String(v));
const reqStr = (v: unknown): string => String(v ?? "");

function json(v: unknown): unknown {
  if (typeof v !== "string") return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/**
 * 비율을 SQL DECIMAL 로 나눠 문자열로 받는다 (JS 에서 나누지 않는다).
 * 분모가 없거나 0 이면 null.
 */
export async function ratios(pairs: [string | null, string | null][]): Promise<(string | null)[]> {
  const idx: number[] = [];
  const params: string[] = [];
  pairs.forEach(([a, b], i) => {
    if (a != null && b != null && !/^-?0*(.0*)?$/.test(b)) {
      idx.push(i);
      params.push(a, b);
    }
  });
  const out: (string | null)[] = pairs.map(() => null);
  if (idx.length === 0) return out;
  const cols = idx.map((_, k) => `ROUND(CAST(? AS DECIMAL(30,8)) / CAST(? AS DECIMAL(30,8)), 6) AS r${k}`).join(", ");
  const [row] = await traderQuery<Row>(`SELECT ${cols}`, params);
  idx.forEach((i, k) => {
    out[i] = str(row?.[`r${k}`]);
  });
  return out;
}

export async function effectiveSettings(): Promise<Record<string, string | null>> {
  const [row] = await traderQuery<Row>("SELECT `value` FROM engine_state WHERE `key` = 'settings_effective'");
  const v = json(row?.value) as { effective?: Record<string, string | null> } | null;
  return v?.effective ?? {};
}

export function clampLimit(raw: unknown, fallback = 50): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, 200);
}

async function accountId(name: string): Promise<{ id: number; name: string; broker: string; createdAt: string | null } | null> {
  const rows = await traderQuery<Row>("SELECT id, name, broker, created_at FROM accounts WHERE name = ?", [name]);
  const r = rows[0];
  return r ? { id: Number(r.id), name: reqStr(r.name), broker: reqStr(r.broker), createdAt: utcIso(str(r.created_at)) } : null;
}

export async function getSummary(accountName: string): Promise<TraderSummary> {
  const [killRow] = await traderQuery<Row>("SELECT `value`, updated_at FROM engine_state WHERE `key` = 'killswitch'");
  const kill = (json(killRow?.value) ?? {}) as { halted?: boolean; reason?: string };
  const [lastQuote] = await traderQuery<Row>("SELECT MAX(ts) AS t FROM quotes");
  const [lastDecision] = await traderQuery<Row>("SELECT MAX(ts) AS t FROM strategy_decisions");
  const base = {
    killswitch: {
      halted: Boolean(kill.halted),
      reason: kill.reason ?? null,
      updatedAt: utcIso(str(killRow?.updated_at)),
    },
    lastQuoteAt: utcIso(str(lastQuote?.t)),
    lastDecisionAt: utcIso(str(lastDecision?.t)),
  };

  const acc = await accountId(accountName);
  if (!acc) {
    return {
      account: null, cash: null, marketValue: null, equity: null, dayStartEquity: null, dayPnl: null,
      initialCash: null, cumReturn: null, dailyLossLimit: null, lossUsage: null, maxPositionValue: null,
      positions: [], openOrders: 0, ...base,
    };
  }

  // 종목별 마지막 시세로 평가 (시세가 없으면 평가금액 null)
  const positions = await traderQuery<Row>(
    `SELECT p.symbol, p.qty, p.avg_price, p.realized_pnl,
            q.price AS last_price, q.ts AS last_ts,
            p.qty * q.price AS market_value,
            (q.price - p.avg_price) * p.qty AS unrealized
       FROM positions p
       LEFT JOIN quotes q ON q.id = (SELECT id FROM quotes WHERE symbol = p.symbol ORDER BY ts DESC, id DESC LIMIT 1)
      WHERE p.account_id = ? AND p.qty <> 0
      ORDER BY p.symbol`,
    [acc.id]
  );
  const [totals] = await traderQuery<Row>(
    `SELECT c.cash,
            dep.initial AS initial_cash,
            m.mv AS market_value,
            CASE WHEN m.missing = 0 THEN c.cash + m.mv END AS equity,
            d.start_equity,
            CASE WHEN m.missing = 0 AND d.start_equity IS NOT NULL THEN c.cash + m.mv - d.start_equity END AS day_pnl
       FROM (SELECT COALESCE(SUM(amount), 0) AS cash FROM cash_ledger WHERE account_id = ?) c
       CROSS JOIN (SELECT COALESCE(SUM(amount), 0) AS initial FROM cash_ledger WHERE account_id = ? AND kind = 'DEPOSIT') dep
       CROSS JOIN (
         SELECT COALESCE(SUM(p.qty * q.price), 0) AS mv,
                COALESCE(SUM(CASE WHEN q.price IS NULL THEN 1 ELSE 0 END), 0) AS missing
           FROM positions p
           LEFT JOIN quotes q ON q.id = (SELECT id FROM quotes WHERE symbol = p.symbol ORDER BY ts DESC, id DESC LIMIT 1)
          WHERE p.account_id = ? AND p.qty <> 0
       ) m
       LEFT JOIN daily_equity d
         ON d.account_id = ? AND d.trade_date = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+09:00'))`,
    [acc.id, acc.id, acc.id, acc.id]
  );
  const [open] = await traderQuery<Row>(
    "SELECT COUNT(*) AS n FROM orders WHERE account_id = ? AND status IN ('PENDING_NEW','NEW','PARTIALLY_FILLED','PENDING_CANCEL')",
    [acc.id]
  );

  const eff = await effectiveSettings();
  const equityStr = str(totals?.equity);
  const initial = str(totals?.initial_cash);
  const dayPnl = str(totals?.day_pnl);
  const lossLimit = eff.risk_daily_loss_limit ?? null;
  const maxPos = eff.risk_max_position_value ?? null;
  const loss = dayPnl != null && dayPnl.startsWith("-") ? dayPnl.slice(1) : dayPnl != null ? "0" : null;
  const gain = equityStr != null && initial != null ? await diff(equityStr, initial) : null;
  const [cumReturn, lossUsage, ...posRatios] = await ratios([
    [gain, initial],
    [loss, lossLimit],
    ...positions.flatMap((p): [string | null, string | null][] => [
      [str(p.market_value), equityStr],
      [str(p.market_value), maxPos],
    ]),
  ]);

  return {
    account: { name: acc.name, broker: acc.broker, createdAt: acc.createdAt },
    cash: str(totals?.cash),
    marketValue: str(totals?.market_value),
    equity: str(totals?.equity),
    dayStartEquity: str(totals?.start_equity),
    dayPnl,
    initialCash: initial,
    cumReturn,
    dailyLossLimit: lossLimit,
    lossUsage,
    maxPositionValue: maxPos,
    positions: positions.map((p, i) => ({
      symbol: reqStr(p.symbol),
      qty: reqStr(p.qty),
      avgPrice: reqStr(p.avg_price),
      lastPrice: str(p.last_price),
      lastPriceAt: utcIso(str(p.last_ts)),
      marketValue: str(p.market_value),
      unrealizedPnl: str(p.unrealized),
      realizedPnl: reqStr(p.realized_pnl),
      weight: posRatios[i * 2] ?? null,
      limitUsage: posRatios[i * 2 + 1] ?? null,
    })),
    openOrders: Number(open?.n ?? 0),
    ...base,
  };
}

/** a - b (SQL DECIMAL) */
async function diff(a: string, b: string): Promise<string | null> {
  const [row] = await traderQuery<Row>("SELECT CAST(? AS DECIMAL(24,4)) - CAST(? AS DECIMAL(24,4)) AS d", [a, b]);
  return str(row?.d);
}

export async function listOrders(accountName: string, limit: number): Promise<TraderOrder[]> {
  const rows = await traderQuery<Row>(
    `SELECT o.* FROM orders o JOIN accounts a ON a.id = o.account_id
      WHERE a.name = ? ORDER BY o.id DESC LIMIT ?`,
    [accountName, limit]
  );
  return rows.map((r) => ({
    clientOrderId: reqStr(r.client_order_id),
    symbol: reqStr(r.symbol),
    side: reqStr(r.side),
    orderType: reqStr(r.order_type),
    qty: reqStr(r.qty),
    limitPrice: str(r.limit_price),
    status: reqStr(r.status),
    filledQty: reqStr(r.filled_qty),
    avgFillPrice: str(r.avg_fill_price),
    strategyId: str(r.strategy_id),
    rejectReason: str(r.reject_reason),
    createdAt: utcIso(str(r.created_at)),
    updatedAt: utcIso(str(r.updated_at)),
  }));
}

export async function listFills(accountName: string, limit: number): Promise<TraderFill[]> {
  const rows = await traderQuery<Row>(
    `SELECT f.*, o.client_order_id FROM fills f
       JOIN orders o ON o.id = f.order_id JOIN accounts a ON a.id = o.account_id
      WHERE a.name = ? ORDER BY f.id DESC LIMIT ?`,
    [accountName, limit]
  );
  return rows.map((r) => ({
    execId: reqStr(r.exec_id),
    clientOrderId: reqStr(r.client_order_id),
    symbol: reqStr(r.symbol),
    side: reqStr(r.side),
    qty: reqStr(r.qty),
    price: reqStr(r.price),
    commission: reqStr(r.commission),
    tax: reqStr(r.tax),
    slippage: reqStr(r.slippage),
    ts: utcIso(str(r.ts)),
  }));
}

export async function listDecisions(
  limit: number,
  opts: { strategy?: string; signalsOnly?: boolean } = {}
): Promise<TraderDecision[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.strategy) {
    where.push("strategy_id = ?");
    params.push(opts.strategy);
  }
  if (opts.signalsOnly) where.push("action IN ('BUY','SELL','EXIT')");
  const rows = await traderQuery<Row>(
    `SELECT * FROM strategy_decisions ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ?`,
    [...params, limit]
  );
  return rows.map((r) => {
    const inputs = json(r.inputs) as { components?: Record<string, unknown> } | null;
    return {
      id: Number(r.id),
      ts: utcIso(str(r.ts)),
      barTs: utcIso(str(r.bar_ts)),
      strategyId: reqStr(r.strategy_id),
      symbol: reqStr(r.symbol),
      action: reqStr(r.action),
      reason: reqStr(r.reason),
      shadow: Boolean(Number(r.shadow ?? 0)),
      score: str(r.score),
      confidence: str(r.confidence),
      riskResult: str(r.risk_result),
      riskReason: str(r.risk_reason),
      clientOrderId: str(r.client_order_id),
      entryPrice: str(r.entry_price),
      stopLoss: str(r.stop_loss),
      takeProfit: str(r.take_profit),
      riskReward: str(r.risk_reward),
      reasons: (json(r.reasons) as string[] | null) ?? null,
      components: inputs?.components ?? null,
    };
  });
}

export async function getPerformance(): Promise<TraderPerformanceRow[]> {
  const rows = await traderQuery<Row>(
    `SELECT d.strategy_id, d.action, p.horizon,
            SUM(p.status = 'DONE') AS n,
            AVG(CASE WHEN p.status = 'DONE' THEN p.return_pct END) AS avg_ret,
            AVG(CASE WHEN p.status = 'DONE' THEN (p.return_pct > 0) END) AS win_rate,
            AVG(CASE WHEN p.status = 'DONE' THEN p.mfe_pct END) AS avg_mfe,
            AVG(CASE WHEN p.status = 'DONE' THEN p.mae_pct END) AS avg_mae,
            SUM(p.status = 'PENDING') AS pending
       FROM signal_performance p JOIN strategy_decisions d ON d.id = p.decision_id
      GROUP BY d.strategy_id, d.action, p.horizon
      ORDER BY d.strategy_id, d.action, FIELD(p.horizon, '5m', '15m', '30m', 'close')`
  );
  return rows.map((r) => ({
    strategyId: reqStr(r.strategy_id),
    action: reqStr(r.action),
    horizon: reqStr(r.horizon),
    count: Number(r.n ?? 0),
    avgReturnPct: str(r.avg_ret),
    winRate: str(r.win_rate),
    avgMfePct: str(r.avg_mfe),
    avgMaePct: str(r.avg_mae),
    pending: Number(r.pending ?? 0),
  }));
}

export async function listRiskEvents(limit: number): Promise<TraderRiskEvent[]> {
  const rows = await traderQuery<Row>("SELECT * FROM risk_events ORDER BY id DESC LIMIT ?", [limit]);
  return rows.map((r) => ({
    id: Number(r.id),
    ts: utcIso(str(r.ts)),
    kind: reqStr(r.kind),
    symbol: str(r.symbol),
    clientOrderId: str(r.client_order_id),
    detail: json(r.detail),
  }));
}
