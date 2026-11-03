import { env } from "../../../config/env.js";
import { HttpError } from "../../../lib/httpError.js";
import { TtlCache } from "../../../lib/ttlCache.js";
import type { CandlePoint } from "../stockSim.types.js";

/**
 * Cboe 공개 데이터 클라이언트 — VIX 지수만 가져온다.
 *
 * 토스증권 Open API 시장 지표에는 VIX 가 없어서, VIX 를 산출하는 Cboe 가 웹사이트용으로 공개하는 데이터를 쓴다.
 * 키는 필요 없다.
 *
 * - `delayed_quotes/quotes/_VIX.json`: 현재값 (15분 지연). 시각은 미 동부 시각이다.
 * - `us_indices/daily_prices/VIX_History.csv`: 1990년부터의 일별 시·고·저·종가
 *
 * `cdn.cboe.com` 은 `cdn-api.cboe.com` 으로 307 리다이렉트하므로 처음부터 후자를 부른다.
 */

export interface VixQuote {
  value: number;
  /** 전일 대비 (포인트) */
  change: number | null;
  /** 0.08 = +8% */
  changeRate: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  /** 마지막 체결 시각 (ISO, UTC) */
  timestamp: string | null;
}

export interface CboeClient {
  getVixQuote(): Promise<VixQuote>;
  /** 최근 `HISTORY_DAYS` 거래일 일봉, 오래된 것부터 */
  getVixHistory(): Promise<CandlePoint[]>;
}

export interface CboeClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

const TIMEOUT_MS = 15_000;
/** 일·주·월봉 차트와 상단 추이선에 쓰는 일봉 개수 (약 3년) */
export const HISTORY_DAYS = 750;

/** 미 동부 시각 "2026-11-02T16:15:01" → UTC ISO. 서머타임은 Intl 로 판단한다. */
export function easternToIso(local: string): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);

  // 그 순간 뉴욕 벽시계가 UTC 보다 몇 시간 늦은지 구한다 (-4 또는 -5).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(asUtc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offset = wall - asUtc;

  return new Date(asUtc - offset).toISOString();
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** `_VIX.json` 의 data → VixQuote */
export function parseVixQuote(body: unknown): VixQuote {
  const data = (body as { data?: Record<string, unknown> } | null)?.data;
  const value = num(data?.current_price);
  if (!data || value == null) {
    throw new HttpError(503, "CBOE_ERROR", "Cboe VIX 응답 형식이 예상과 다릅니다.");
  }

  const changePercent = num(data.price_change_percent);
  return {
    value,
    change: num(data.price_change),
    changeRate: changePercent == null ? null : changePercent / 100,
    open: num(data.open),
    high: num(data.high),
    low: num(data.low),
    timestamp: typeof data.last_trade_time === "string" ? easternToIso(data.last_trade_time) : null,
  };
}

/**
 * `VIX_History.csv` → 일봉 (오래된 것부터, 마지막 `limit` 개).
 * 시각은 미국 거래일 날짜의 KST 자정으로 둔다 — 화면(KST 날짜)에 미국 거래일이 그대로 보이게 하려는 것이다.
 */
export function parseVixHistory(csv: string, limit = HISTORY_DAYS): CandlePoint[] {
  const rows: CandlePoint[] = [];

  for (const line of csv.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d{2})\/(\d{2})\/(\d{4}),([\d.]+),([\d.]+),([\d.]+),([\d.]+)$/);
    if (!m) continue; // 헤더·빈 줄
    const [, mm, dd, yyyy, open, high, low, close] = m;
    rows.push({
      time: `${yyyy}-${mm}-${dd}T00:00:00+09:00`,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: 0,
    });
  }

  return rows.slice(-limit);
}

export function createCboeClient(options: CboeClientOptions): CboeClient {
  const doFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const quoteCache = new TtlCache<VixQuote>(60_000);
  const historyCache = new TtlCache<CandlePoint[]>(60 * 60_000);

  async function get(path: string): Promise<Response> {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new HttpError(503, "CBOE_UNREACHABLE", `Cboe 에 연결하지 못했습니다: ${reason}`);
    }
    if (!res.ok) {
      throw new HttpError(503, "CBOE_ERROR", `Cboe 응답 오류 (${res.status})`);
    }
    return res;
  }

  return {
    getVixQuote: () => quoteCache.get("VIX", async () => parseVixQuote(await (await get("/delayed_quotes/quotes/_VIX.json")).json())),
    getVixHistory: () =>
      historyCache.get("VIX", async () => {
        const rows = parseVixHistory(await (await get("/us_indices/daily_prices/VIX_History.csv")).text());
        if (rows.length === 0) throw new HttpError(503, "CBOE_ERROR", "Cboe VIX 일별 기록이 비어 있습니다.");
        return rows;
      }),
  };
}

let singleton: CboeClient | null = null;

/** 캐시를 프로세스 전체가 같이 쓰도록 하나만 만든다. */
export function getCboeClient(): CboeClient {
  singleton ??= createCboeClient({ baseUrl: env.CBOE_API_BASE_URL });
  return singleton;
}
