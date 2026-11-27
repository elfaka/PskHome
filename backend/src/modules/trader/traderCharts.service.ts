import { traderQuery, utcIso } from "./traderDb.js";
import type { TraderChart, TraderIndicators, TraderScorePart, TraderScores, TraderStats, TraderTripStats } from "./trader.types.js";

/**
 * 그래프·지표 — 종목 차트, 점수 추이, 오늘 통계. 엔진 DB 를 SELECT 로만 읽는다.
 *
 * - 금액·비율은 SQL DECIMAL 로 계산해 문자열로 내려보낸다 (JS number 로 계산하지 않는다)
 * - "오늘"·거래일은 KST. DB 시각은 UTC 이므로 CONVERT_TZ 로 경계를 만든다 (이름 대신 오프셋이라 시간대 테이블이 필요 없다)
 * - 봉 구간 계산은 UNIX_TIMESTAMP 대신 TIMESTAMPDIFF 를 쓴다 (세션 시간대의 영향을 받지 않는다)
 */

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (v == null ? null : String(v));
const reqStr = (v: unknown): string => String(v ?? "");

/** 그릴 수 있는 봉 주기 (엔진이 1분·5분봉을 저장한다) */
export const CHART_INTERVALS = [60, 300] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];

/** 엔진 scoring/combine.py 의 CombinationRule 기본값 — 바꾸면 함께 고친다 */
export const SCORE_THRESHOLDS = { buy: "80", watch: "65", exit: "30" } as const;

export function isSymbol(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9]{1,16}$/.test(v);
}

export function parseInterval(v: unknown): ChartInterval | null {
  if (v == null || v === "") return 60;
  const n = Number(v);
  return (CHART_INTERVALS as readonly number[]).includes(n) ? (n as ChartInterval) : null;
}

/** JSON 안의 값을 문자열로 (JSON null → SQL NULL) */
function jsonVal(path: string, col = "inputs"): string {
  return `CASE WHEN JSON_TYPE(JSON_EXTRACT(${col}, '${path}')) IN ('NULL') OR JSON_EXTRACT(${col}, '${path}') IS NULL
               THEN NULL ELSE JSON_UNQUOTE(JSON_EXTRACT(${col}, '${path}')) END`;
}

/** 봉 시작 시각 (UTC DATETIME) 을 interval 초 단위로 내린다 */
function bucket(col: string): string {
  return `DATE_ADD('2000-01-01', INTERVAL (TIMESTAMPDIFF(SECOND, '2000-01-01', ${col}) DIV ?) * ? SECOND)`;
}

/** KST 날짜 경계 (UTC). t 가 속한 KST 거래일의 00:00 */
const KST_DAY_START = (expr: string) => `CONVERT_TZ(DATE(CONVERT_TZ(${expr}, '+00:00', '+09:00')), '+09:00', '+00:00')`;
const TODAY_UTC = KST_DAY_START("UTC_TIMESTAMP()");

async function accountId(name: string): Promise<number | null> {
  const [r] = await traderQuery<Row>("SELECT id FROM accounts WHERE name = ?", [name]);
  return r ? Number(r.id) : null;
}

async function symbolList(): Promise<string[]> {
  const [eff] = await traderQuery<Row>("SELECT `value` FROM engine_state WHERE `key` = 'settings_effective'");
  let parsed: unknown = eff?.value ?? null;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = null;
    }
  }
  const fromInfo = (parsed as { info?: { symbols?: unknown } } | null)?.info?.symbols;
  const configured = Array.isArray(fromInfo) ? fromInfo.filter(isSymbol) : [];
  // 지금 설정된 종목을 앞에, 예전에 돌렸던 종목(봉 기록이 있는 것)을 뒤에
  const rows = await traderQuery<Row>("SELECT DISTINCT symbol FROM bars ORDER BY symbol");
  const past = rows.map((r) => reqStr(r.symbol)).filter((s) => isSymbol(s) && !configured.includes(s));
  return [...configured, ...past];
}

function indicatorsOf(r: Row | undefined): TraderIndicators | null {
  if (!r) return null;
  return {
    barTs: utcIso(str(r.bar_ts)),
    close: str(r.i_close),
    vwap: str(r.i_vwap),
    vwapGap: str(r.i_vwap_gap),
    sma20: str(r.i_sma20),
    rsi14: str(r.i_rsi14),
    macdHist: str(r.i_macd_hist),
    atr14: str(r.i_atr14),
    volumeRatio: str(r.i_volume_ratio),
  };
}

const HAS_INDICATORS = "JSON_TYPE(JSON_EXTRACT(inputs, '$.indicators')) = 'OBJECT'";

/**
 * 종목 차트 — 그 종목 봉이 있는 마지막 거래일(KST) 하루치.
 * 장이 끝난 뒤·주말에도 마지막 거래일을 보여준다.
 */
export async function getChart(accountName: string, symbol: string, interval: ChartInterval): Promise<TraderChart> {
  const symbols = await symbolList();
  const latestInd = await traderQuery<Row>(
    `SELECT x.*,
            CASE WHEN i_close IS NOT NULL AND i_vwap IS NOT NULL AND CAST(i_vwap AS DECIMAL(24,6)) <> 0
                 THEN ROUND((CAST(i_close AS DECIMAL(24,6)) - CAST(i_vwap AS DECIMAL(24,6))) / CAST(i_vwap AS DECIMAL(24,6)), 6)
            END AS i_vwap_gap
       FROM (
         SELECT bar_ts,
                ${jsonVal("$.indicators.close")} AS i_close, ${jsonVal("$.indicators.vwap")} AS i_vwap,
                ${jsonVal("$.indicators.sma20")} AS i_sma20, ${jsonVal("$.indicators.rsi14")} AS i_rsi14,
                ${jsonVal("$.indicators.macd_hist")} AS i_macd_hist, ${jsonVal("$.indicators.atr14")} AS i_atr14,
                ${jsonVal("$.indicators.volume_ratio")} AS i_volume_ratio
           FROM strategy_decisions WHERE symbol = ? AND ${HAS_INDICATORS}
          ORDER BY id DESC LIMIT 1
       ) x`,
    [symbol]
  );
  const [day] = await traderQuery<Row>(
    `SELECT ${KST_DAY_START("MAX(start_ts)")} AS d0, DATE(CONVERT_TZ(MAX(start_ts), '+00:00', '+09:00')) AS kst
       FROM bars WHERE symbol = ? AND interval_s = ?`,
    [symbol, interval]
  );
  const d0 = str(day?.d0);
  const empty: TraderChart = {
    symbol,
    interval,
    tradeDate: null,
    symbols,
    bars: [],
    lines: [],
    fills: [],
    signals: [],
    position: null,
    indicators: indicatorsOf(latestInd[0]),
  };
  if (!d0) return { ...empty, position: await positionOf(accountName, symbol) };
  const range = (col: string) => `${col} >= ? AND ${col} < DATE_ADD(?, INTERVAL 1 DAY)`;

  const bars = await traderQuery<Row>(
    `SELECT start_ts, open, high, low, close, volume FROM bars
      WHERE symbol = ? AND interval_s = ? AND ${range("start_ts")} ORDER BY start_ts LIMIT 1500`,
    [symbol, interval, d0, d0]
  );
  // 1분봉 판단의 지표를 봉 구간의 마지막 값으로
  const lines = await traderQuery<Row>(
    `SELECT t, vwap, sma20 FROM (
       SELECT ${bucket("bar_ts")} AS t,
              ${jsonVal("$.indicators.vwap")} AS vwap, ${jsonVal("$.indicators.sma20")} AS sma20,
              ROW_NUMBER() OVER (PARTITION BY TIMESTAMPDIFF(SECOND, '2000-01-01', bar_ts) DIV ? ORDER BY bar_ts DESC, id DESC) AS rn
         FROM strategy_decisions
        WHERE symbol = ? AND ${range("bar_ts")} AND ${HAS_INDICATORS}
     ) x WHERE rn = 1 ORDER BY t`,
    [interval, interval, interval, symbol, d0, d0]
  );
  const acc = await accountId(accountName);
  const fills = acc
    ? await traderQuery<Row>(
        `SELECT ${bucket("f.ts")} AS t, f.ts, f.side, f.qty, f.price, o.strategy_id
           FROM fills f JOIN orders o ON o.id = f.order_id
          WHERE o.account_id = ? AND f.symbol = ? AND ${range("f.ts")} ORDER BY f.ts, f.id LIMIT 500`,
        [interval, interval, acc, symbol, d0, d0]
      )
    : [];
  const signals = await traderQuery<Row>(
    `SELECT ${bucket("bar_ts")} AS t, ts, strategy_id, action, shadow, risk_result
       FROM strategy_decisions
      WHERE symbol = ? AND action IN ('BUY','SELL','EXIT') AND ${range("bar_ts")}
      ORDER BY bar_ts, id LIMIT 500`,
    [interval, interval, symbol, d0, d0]
  );

  return {
    ...empty,
    tradeDate: str(day?.kst)?.slice(0, 10) ?? null,
    bars: bars.map((b) => ({
      t: utcIso(str(b.start_ts)) ?? "",
      o: reqStr(b.open),
      h: reqStr(b.high),
      l: reqStr(b.low),
      c: reqStr(b.close),
      v: reqStr(b.volume),
    })),
    lines: lines.map((r) => ({ t: utcIso(str(r.t)) ?? "", vwap: str(r.vwap), sma20: str(r.sma20) })),
    fills: fills.map((f) => ({
      t: utcIso(str(f.t)) ?? "",
      ts: utcIso(str(f.ts)),
      side: reqStr(f.side),
      qty: reqStr(f.qty),
      price: reqStr(f.price),
      strategyId: str(f.strategy_id),
    })),
    signals: signals.map((s) => ({
      t: utcIso(str(s.t)) ?? "",
      ts: utcIso(str(s.ts)),
      strategyId: reqStr(s.strategy_id),
      action: reqStr(s.action),
      shadow: Boolean(Number(s.shadow ?? 0)),
      riskResult: str(s.risk_result),
    })),
    position: await positionOf(accountName, symbol),
  };
}

/** 보유 중이면 평균단가와, 마지막으로 체결된 매수 주문의 손절·목표가 */
async function positionOf(accountName: string, symbol: string): Promise<TraderChart["position"]> {
  const [r] = await traderQuery<Row>(
    `SELECT p.qty, p.avg_price,
            (SELECT d.stop_loss FROM orders o JOIN strategy_decisions d ON d.id = o.decision_id
              WHERE o.account_id = p.account_id AND o.symbol = p.symbol AND o.side = 'BUY' AND o.filled_qty > 0
              ORDER BY o.id DESC LIMIT 1) AS stop_loss,
            (SELECT d.take_profit FROM orders o JOIN strategy_decisions d ON d.id = o.decision_id
              WHERE o.account_id = p.account_id AND o.symbol = p.symbol AND o.side = 'BUY' AND o.filled_qty > 0
              ORDER BY o.id DESC LIMIT 1) AS take_profit
       FROM positions p JOIN accounts a ON a.id = p.account_id
      WHERE a.name = ? AND p.symbol = ? AND p.qty > 0`,
    [accountName, symbol]
  );
  if (!r) return null;
  return { qty: reqStr(r.qty), avgPrice: reqStr(r.avg_price), stopLoss: str(r.stop_loss), takeProfit: str(r.take_profit) };
}

const PART_KEYS = ["technical", "flow", "market", "global", "news"] as const;

/** 점수 전략(intraday_score) 의 합계·구성 점수 추이 — 그 종목 판단이 있는 마지막 거래일 */
export async function getScores(symbol: string): Promise<TraderScores> {
  const base: TraderScores = { symbol, tradeDate: null, thresholds: { ...SCORE_THRESHOLDS }, points: [], latest: null };
  const [day] = await traderQuery<Row>(
    `SELECT ${KST_DAY_START("MAX(bar_ts)")} AS d0, DATE(CONVERT_TZ(MAX(bar_ts), '+00:00', '+09:00')) AS kst
       FROM strategy_decisions WHERE strategy_id = 'intraday_score' AND symbol = ?`,
    [symbol]
  );
  const d0 = str(day?.d0);
  if (!d0) return base;
  const rows = await traderQuery<Row>(
    `SELECT id, ts, bar_ts, action, score,
            ${jsonVal("$.components.price.points")} AS p_price,
            ${jsonVal("$.components.context.points")} AS p_context,
            ${jsonVal("$.components.issue.points")} AS p_issue
       FROM strategy_decisions
      WHERE strategy_id = 'intraday_score' AND symbol = ? AND bar_ts >= ? AND bar_ts < DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY bar_ts, id LIMIT 1000`,
    [symbol, d0, d0]
  );
  const [last] = await traderQuery<Row>(
    `SELECT ts, JSON_EXTRACT(inputs, '$.parts') AS parts FROM strategy_decisions
      WHERE strategy_id = 'intraday_score' AND symbol = ? ORDER BY id DESC LIMIT 1`,
    [symbol]
  );
  let parts: unknown = last?.parts ?? null;
  if (typeof parts === "string") {
    try {
      parts = JSON.parse(parts);
    } catch {
      parts = null;
    }
  }
  const latestParts: Record<string, TraderScorePart> = {};
  if (parts && typeof parts === "object") {
    for (const k of PART_KEYS) {
      const p = (parts as Record<string, Record<string, unknown> | undefined>)[k];
      if (!p) continue;
      latestParts[k] = {
        points: str(p.points),
        max: str(p.max),
        note: reqStr(p.note),
        available: Boolean(p.available),
      };
    }
  }
  return {
    ...base,
    tradeDate: str(day?.kst)?.slice(0, 10) ?? null,
    points: rows.map((r) => ({
      t: utcIso(str(r.bar_ts)) ?? "",
      action: reqStr(r.action),
      total: str(r.score),
      price: str(r.p_price),
      context: str(r.p_context),
      issue: str(r.p_issue),
    })),
    latest: last ? { ts: utcIso(str(last.ts)), parts: latestParts } : null,
  };
}

function tripStats(r: Row | undefined): TraderTripStats {
  return {
    count: Number(r?.n ?? 0),
    wins: Number(r?.wins ?? 0),
    winRate: str(r?.win_rate),
    netPnl: str(r?.net),
    avgPnl: str(r?.avg_net),
  };
}

/**
 * 오늘 통계 — 체결·비용·청산된 거래(승률·평균 손익)·손익 합계·위험 관리 거부 사유.
 *
 * 청산된 거래: 종목별로 보유 수량이 0 에서 시작해 다시 0 이 되기까지의 체결 묶음.
 * 손익 = 매도대금 − 매수대금 − 수수료 − 세금 (모두 SQL DECIMAL).
 */
export async function getStats(accountName: string): Promise<TraderStats> {
  const acc = await accountId(accountName);
  const [today] = acc
    ? await traderQuery<Row>(
        `SELECT COUNT(*) AS n, COALESCE(SUM(f.side = 'BUY'), 0) AS buys, COALESCE(SUM(f.side = 'SELL'), 0) AS sells,
                COALESCE(SUM(f.commission), 0) AS commission, COALESCE(SUM(f.tax), 0) AS tax,
                COALESCE(SUM(f.slippage), 0) AS slippage, COALESCE(SUM(f.commission + f.tax), 0) AS costs
           FROM fills f JOIN orders o ON o.id = f.order_id
          WHERE o.account_id = ? AND f.ts >= ${TODAY_UTC}`,
        [acc]
      )
    : [];
  const [rr] = await traderQuery<Row>(
    `SELECT ROUND(AVG(risk_reward), 4) AS avg_rr FROM strategy_decisions
      WHERE ts >= ${TODAY_UTC} AND action = 'BUY' AND risk_result = 'APPROVED' AND risk_reward IS NOT NULL`
  );

  const trips = acc
    ? await traderQuery<Row>(
        `WITH f AS (
           SELECT f.id, f.ts, f.symbol, f.side,
                  CASE WHEN f.side = 'BUY' THEN f.qty ELSE -f.qty END AS sq,
                  CASE WHEN f.side = 'SELL' THEN f.qty * f.price ELSE -(f.qty * f.price) END - f.commission - f.tax AS cash
             FROM fills f JOIN orders o ON o.id = f.order_id WHERE o.account_id = ?
         ), r AS (
           SELECT f.*, SUM(sq) OVER (PARTITION BY symbol ORDER BY ts, id) AS pos FROM f
         ), g AS (
           SELECT r.*, COALESCE(SUM(pos = 0) OVER (PARTITION BY symbol ORDER BY ts, id
                                                    ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS trip
             FROM r
         ), t AS (
           SELECT symbol, trip, MAX(ts) AS end_ts, SUM(cash) AS net, SUM(pos = 0) AS closed FROM g GROUP BY symbol, trip
         )
         SELECT scope, COUNT(*) AS n, SUM(net > 0) AS wins,
                ROUND(SUM(net > 0) / COUNT(*), 6) AS win_rate,
                ROUND(SUM(net), 4) AS net, ROUND(AVG(net), 4) AS avg_net
           FROM (
             SELECT 'all' AS scope, net FROM t WHERE closed > 0
             UNION ALL
             SELECT 'today' AS scope, net FROM t WHERE closed > 0 AND end_ts >= ${TODAY_UTC}
           ) x GROUP BY scope`,
        [acc]
      )
    : [];

  const [pnl] = acc
    ? await traderQuery<Row>(
        `SELECT SUM(p.realized_pnl) AS realized,
                ROUND(SUM(CASE WHEN p.qty <> 0 THEN (q.price - p.avg_price) * p.qty ELSE 0 END), 4) AS unrealized
           FROM positions p
           LEFT JOIN quotes q ON q.id = (SELECT id FROM quotes WHERE symbol = p.symbol ORDER BY ts DESC, id DESC LIMIT 1)
          WHERE p.account_id = ?`,
        [acc]
      )
    : [];

  const rejections = await traderQuery<Row>(
    `SELECT SUBSTRING_INDEX(risk_reason, ':', 1) AS code, COUNT(*) AS n, MAX(risk_reason) AS sample
       FROM strategy_decisions
      WHERE ts >= ${TODAY_UTC} AND risk_result = 'REJECTED'
      GROUP BY code ORDER BY n DESC, code LIMIT 20`
  );

  return {
    today: {
      fills: Number(today?.n ?? 0),
      buys: Number(today?.buys ?? 0),
      sells: Number(today?.sells ?? 0),
      commission: reqStr(today?.commission ?? "0"),
      tax: reqStr(today?.tax ?? "0"),
      slippage: reqStr(today?.slippage ?? "0"),
      costs: reqStr(today?.costs ?? "0"),
      avgPlannedRiskReward: str(rr?.avg_rr),
    },
    trips: {
      today: tripStats(trips.find((r) => r.scope === "today")),
      all: tripStats(trips.find((r) => r.scope === "all")),
    },
    realizedPnl: str(pnl?.realized),
    unrealizedPnl: str(pnl?.unrealized),
    rejections: rejections.map((r) => ({ code: reqStr(r.code).trim() || "UNKNOWN", count: Number(r.n ?? 0), sample: str(r.sample) })),
  };
}
