import { env } from "../../../config/env.js";
import { HttpError } from "../../../lib/httpError.js";
import type {
  TossCandlePage,
  TossErrorBody,
  TossInvestorTradingPage,
  TossListedStock,
  TossMarket,
  TossOAuthErrorBody,
  TossOrderbook,
  TossPrice,
  TossPriceLimits,
  TossResponse,
  TossShortSellingPage,
  TossStock,
  TossTokenResponse,
  TossTrade,
} from "./toss.types.js";

/**
 * 토스증권 Open API 클라이언트 — 시세·종목 조회 전용.
 *
 * [주문 API 를 노출하지 않는 이유]
 * 토스 Open API 의 주문(`/api/v1/orders` 등)은 **실제 계좌에 체결**된다.
 * 모의투자는 우리 서버 안에서만 가상 체결하므로, 이 클라이언트는 GET 조회 메서드만 갖는다.
 *
 * [토큰 관리]
 * - Client Credentials 로 발급받고 refresh token 은 없다. 만료가 다가오면 같은 엔드포인트로 재발급한다.
 * - **client 당 유효한 토큰은 1개뿐**이라, 재발급하면 이전 토큰은 즉시 무효가 된다.
 *   그래서 요청마다 발급하지 않고 메모리에 캐시하며, 동시에 여러 요청이 와도 발급은 한 번만 한다.
 * - 다른 프로세스(예: 로컬 개발 서버)가 같은 키로 재발급하면 우리 토큰이 죽는다.
 *   401(invalid-token / expired-token)을 받으면 토큰을 버리고 한 번만 재시도한다.
 */
export interface TossClient {
  getPrices(symbols: string[]): Promise<TossPrice[]>;
  /** `before` 는 이전 응답의 `nextBefore` (이 시각과 같거나 이전 봉부터) */
  getCandles(symbol: string, interval: "1m" | "1d", count: number, before?: string): Promise<TossCandlePage>;
  getStocks(symbols: string[]): Promise<TossStock[]>;
  getAllStocks(market: TossMarket): Promise<TossListedStock[]>;
  getOrderbook(symbol: string): Promise<TossOrderbook>;
  getTrades(symbol: string, count: number): Promise<TossTrade[]>;
  getPriceLimits(symbol: string): Promise<TossPriceLimits>;
  /** 국내 종목만. 최신순 */
  getInvestorTrading(symbol: string, count: number): Promise<TossInvestorTradingPage>;
  /** 국내 종목만. 최신순 */
  getShortSelling(symbol: string, count: number): Promise<TossShortSellingPage>;
}

export interface TossClientOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

/** 만료 직전 토큰으로 요청하다 실패하지 않도록 여유를 두고 갱신한다. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const TOKEN_REJECTED_CODES = new Set(["invalid-token", "expired-token"]);

/**
 * 토스 호출 실패(연결·인증·허용 IP·토스 쪽 오류)를 알리는 상태코드.
 *
 * 의미로는 502 Bad Gateway 가 맞지만 운영(elfaka.kr)은 Cloudflare 뒤에 있고,
 * Cloudflare 는 원본이 502/504 를 주면 본문을 버리고 자기 오류 페이지(`error code: 502`)로 바꾼다.
 * 그러면 `{ error: { code, message } }` 가 사라져 화면에는 "Request failed with status code 502" 만 남는다.
 * 503 은 원본 응답을 그대로 통과시키므로 원인 메시지가 사용자에게 전달된다.
 */
const UPSTREAM_FAILURE = 503;

interface CachedToken {
  value: string;
  expiresAt: number;
}

export function createTossClient(options: TossClientOptions): TossClient {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  let cached: CachedToken | null = null;
  let pending: Promise<CachedToken> | null = null;

  async function send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new HttpError(UPSTREAM_FAILURE, "TOSS_UNREACHABLE", `토스 API 에 연결하지 못했습니다: ${reason}`);
    }
  }

  async function issueToken(): Promise<CachedToken> {
    const res = await send(`${baseUrl}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: options.clientId,
        client_secret: options.clientSecret,
      }),
    });

    if (!res.ok) {
      const body = (await readJson(res)) as TossOAuthErrorBody | null;
      const detail = body?.error_description ?? body?.error ?? res.statusText;

      if (res.status === 403) {
        throw new HttpError(
          UPSTREAM_FAILURE,
          "TOSS_IP_NOT_ALLOWED",
          `토스 API 가 이 서버 IP 를 허용하지 않습니다. WTS 설정 > Open API > 허용 IP 관리에 등록하세요. (${detail})`
        );
      }
      if (res.status === 429) {
        throw new HttpError(503, "TOSS_RATE_LIMITED", "토스 API 요청 한도를 넘었습니다. 잠시 후 다시 시도하세요.");
      }
      throw new HttpError(UPSTREAM_FAILURE, "TOSS_AUTH_FAILED", `토스 API 토큰 발급에 실패했습니다: ${detail}`);
    }

    const token = (await res.json()) as TossTokenResponse;
    return {
      value: token.access_token,
      expiresAt: now() + token.expires_in * 1000,
    };
  }

  async function getToken(): Promise<string> {
    if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > now()) {
      return cached.value;
    }

    // 동시에 들어온 요청이 각자 발급하면 서로의 토큰을 무효화한다 → 발급은 하나로 합친다.
    pending ??= issueToken().finally(() => {
      pending = null;
    });

    cached = await pending;
    return cached.value;
  }

  async function get<T>(path: string, query: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams(query).toString();
    const url = qs ? `${baseUrl}${path}?${qs}` : `${baseUrl}${path}`;

    for (let attempt = 0; ; attempt++) {
      const token = await getToken();
      const res = await send(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });

      if (res.ok) {
        return ((await res.json()) as TossResponse<T>).result;
      }

      const body = (await readJson(res)) as TossErrorBody | null;
      const code = body?.error?.code ?? "";
      const message = body?.error?.message ?? res.statusText;

      if (res.status === 401 && TOKEN_REJECTED_CODES.has(code) && attempt === 0) {
        // 다른 요청이 이미 새 토큰으로 바꿨다면 그 토큰은 살려 둔다.
        if (cached?.value === token) cached = null;
        continue;
      }

      throw toHttpError(res.status, code, message);
    }
  }

  return {
    getPrices: (symbols) => get<TossPrice[]>("/api/v1/prices", { symbols: symbols.join(",") }),
    getCandles: (symbol, interval, count, before) =>
      get<TossCandlePage>("/api/v1/candles", {
        symbol,
        interval,
        count: String(count),
        ...(before ? { before } : {}),
      }),
    getStocks: (symbols) => get<TossStock[]>("/api/v1/stocks", { symbols: symbols.join(",") }),
    getAllStocks: (market) => get<TossListedStock[]>("/api/v1/stocks/all", { market }),
    getOrderbook: (symbol) => get<TossOrderbook>("/api/v1/orderbook", { symbol }),
    getTrades: (symbol, count) => get<TossTrade[]>("/api/v1/trades", { symbol, count: String(count) }),
    getPriceLimits: (symbol) => get<TossPriceLimits>("/api/v1/price-limits", { symbol }),
    getInvestorTrading: (symbol, count) =>
      get<TossInvestorTradingPage>(`/api/v1/stocks/${encodeURIComponent(symbol)}/investor-trading`, {
        count: String(count),
      }),
    getShortSelling: (symbol, count) =>
      get<TossShortSellingPage>(`/api/v1/stocks/${encodeURIComponent(symbol)}/short-selling`, {
        count: String(count),
      }),
  };
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function toHttpError(status: number, code: string, message: string): HttpError {
  if (status === 429) {
    return new HttpError(503, "TOSS_RATE_LIMITED", "토스 API 요청 한도를 넘었습니다. 잠시 후 다시 시도하세요.");
  }
  if (status === 403 && code === "ip-not-allowed") {
    return new HttpError(
      UPSTREAM_FAILURE,
      "TOSS_IP_NOT_ALLOWED",
      "토스 API 가 이 서버 IP 를 허용하지 않습니다. WTS 설정 > Open API > 허용 IP 관리에 등록하세요."
    );
  }
  // 잘못된 심볼 같은 요청 오류는 그대로 클라이언트 오류로 돌려준다.
  if (status === 400 || status === 404) {
    return new HttpError(status, "TOSS_REQUEST_REJECTED", message);
  }
  return new HttpError(UPSTREAM_FAILURE, "TOSS_API_ERROR", `토스 API 오류 (${status} ${code}): ${message}`);
}

let singleton: TossClient | null = null;

/**
 * 환경변수로 만든 공유 클라이언트. 토큰 캐시를 프로세스 전체가 같이 써야 하므로 하나만 만든다.
 * 키가 없으면 앱 부팅은 막지 않고 이 기능의 요청만 503 으로 실패한다.
 */
export function getTossClient(): TossClient {
  if (!env.TOSS_CLIENT_ID || !env.TOSS_CLIENT_SECRET) {
    throw new HttpError(
      503,
      "TOSS_NOT_CONFIGURED",
      "토스 API 키(TOSS_CLIENT_ID / TOSS_CLIENT_SECRET)가 설정되지 않았습니다."
    );
  }

  singleton ??= createTossClient({
    baseUrl: env.TOSS_API_BASE_URL,
    clientId: env.TOSS_CLIENT_ID,
    clientSecret: env.TOSS_CLIENT_SECRET,
  });

  return singleton;
}
