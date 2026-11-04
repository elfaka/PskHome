import { z } from "zod";

import { env } from "../../config/env.js";
import { HttpError } from "../../lib/httpError.js";
import { TtlCache } from "../../lib/ttlCache.js";
import type { FlightSearchQuery, FlightSearchResult, ParsedFlightSearch } from "./flights.types.js";
import { getSerpApiClient, type SerpApiClient } from "./serpapi/serpApiClient.js";

/**
 * 항공권 최저가 검색.
 *
 * | 규칙 | 값 |
 * |---|---|
 * | 공항 코드 | 대문자 IATA 3자리 (소문자는 대문자로 바꿔 받는다), 출발 ≠ 도착 |
 * | 출발일 | 오늘(KST) ~ 오늘 + 330일 |
 * | 귀국일 | 왕복만 필수, 출발일 이상. 편도에 주면 400 |
 * | 인원 | 성인 1~9명 |
 * | 캐시 | 같은 조건 30분 (일일 한도를 쓰지 않는다) |
 * | 일일 한도 | 사용자당 `FLIGHTS_DAILY_LIMIT`회 (KST 자정에 초기화). SerpApi 호출이 실패하면 돌려준다 |
 */

export const MAX_DAYS_AHEAD = 330;
const CACHE_TTL_MS = 30 * 60_000;
const KST_OFFSET_MS = 9 * 60 * 60_000;

/** KST 기준 날짜 YYYY-MM-DD */
export function kstDate(now: Date): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 실재하는 달력 날짜인지 (2026-02-30 같은 값을 거른다) */
function isRealDate(value: string): boolean {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const iata = z
  .string({ error: "공항 코드를 입력하세요." })
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, "공항 코드는 영문 3자리(IATA)여야 합니다."));

const ymd = (label: string) =>
  z
    .string({ error: `${label}을 입력하세요.` })
    .trim()
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && isRealDate(v), `${label}은 YYYY-MM-DD 형식이어야 합니다.`);

const querySchema = z.object({
  from: iata,
  to: iata,
  date: ymd("출발일"),
  returnDate: ymd("귀국일").optional(),
  tripType: z.enum(["oneway", "round"], { error: "tripType 은 oneway 또는 round 여야 합니다." }).default("oneway"),
  adults: z.coerce
    .number({ error: "인원은 숫자여야 합니다." })
    .int("인원은 정수여야 합니다.")
    .min(1, "인원은 1명 이상이어야 합니다.")
    .max(9, "인원은 9명 이하여야 합니다.")
    .default(1),
});

/**
 * 쿼리스트링 → 검증된 검색 조건. 규칙에 어긋나면 400 `INVALID_PARAM`.
 * 빈 문자열은 값이 없는 것으로 본다 (폼에서 비워 둔 귀국일 등).
 */
export function parseSearchQuery(raw: Record<string, unknown>, now = new Date()): FlightSearchQuery {
  const provided = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = querySchema.safeParse(provided);
  if (!parsed.success) {
    throw HttpError.badRequest(parsed.error.issues[0]?.message ?? "잘못된 검색 조건입니다.", "INVALID_PARAM");
  }

  const q = parsed.data;
  const today = kstDate(now);

  if (q.from === q.to) throw HttpError.badRequest("출발지와 도착지가 같습니다.", "INVALID_PARAM");
  if (q.date < today) throw HttpError.badRequest("출발일은 오늘 이후여야 합니다.", "INVALID_PARAM");
  if (q.date > addDays(today, MAX_DAYS_AHEAD)) {
    throw HttpError.badRequest(`출발일은 오늘부터 ${MAX_DAYS_AHEAD}일 이내여야 합니다.`, "INVALID_PARAM");
  }

  if (q.tripType === "round") {
    if (!q.returnDate) throw HttpError.badRequest("왕복은 귀국일이 필요합니다.", "INVALID_PARAM");
    if (q.returnDate < q.date) throw HttpError.badRequest("귀국일은 출발일 이후여야 합니다.", "INVALID_PARAM");
  } else if (q.returnDate) {
    throw HttpError.badRequest("편도 검색에는 귀국일을 넣지 않습니다.", "INVALID_PARAM");
  }

  return {
    from: q.from,
    to: q.to,
    date: q.date,
    ...(q.tripType === "round" ? { returnDate: q.returnDate } : {}),
    tripType: q.tripType,
    adults: q.adults,
  };
}

/** 사용자별 하루 검색 횟수. 프로세스 메모리라 재배포하면 초기화된다 (세션과 같은 제약) */
export class DailyLimiter {
  private readonly counts = new Map<string, { day: string; count: number }>();

  constructor(private readonly limit: number) {}

  private entry(userId: string, day: string) {
    const e = this.counts.get(userId);
    if (e && e.day === day) return e;
    const fresh = { day, count: 0 };
    this.counts.set(userId, fresh);
    return fresh;
  }

  remaining(userId: string, day: string): number {
    return Math.max(0, this.limit - this.entry(userId, day).count);
  }

  consume(userId: string, day: string): void {
    const e = this.entry(userId, day);
    if (e.count >= this.limit) {
      throw new HttpError(
        429,
        "DAILY_LIMIT_EXCEEDED",
        `오늘 검색 한도(${this.limit}회)를 모두 썼습니다. 내일 다시 시도하세요.`
      );
    }
    e.count += 1;
  }

  refund(userId: string, day: string): void {
    const e = this.entry(userId, day);
    e.count = Math.max(0, e.count - 1);
  }
}

export interface FlightsServiceOptions {
  getClient?: () => SerpApiClient | null;
  dailyLimit?: number;
  now?: () => Date;
}

export function createFlightsService(options: FlightsServiceOptions = {}) {
  const getClient = options.getClient ?? getSerpApiClient;
  const now = options.now ?? (() => new Date());
  const limiter = new DailyLimiter(options.dailyLimit ?? env.FLIGHTS_DAILY_LIMIT);
  const cache = new TtlCache<ParsedFlightSearch & { fetchedAt: string }>(CACHE_TTL_MS);

  return {
    parseSearchQuery: (raw: Record<string, unknown>) => parseSearchQuery(raw, now()),

    async search(userId: string, query: FlightSearchQuery): Promise<FlightSearchResult> {
      const client = getClient();
      if (!client) {
        throw new HttpError(503, "SERPAPI_DISABLED", "항공권 검색이 설정되지 않았습니다 (SERPAPI_API_KEY 없음).");
      }

      const today = kstDate(now());
      const key = [query.tripType, query.from, query.to, query.date, query.returnDate ?? "-", query.adults].join(":");
      const cached = cache.has(key);

      // 캐시에서 꺼내는 요청은 SerpApi 를 부르지 않으므로 한도를 쓰지 않는다
      if (!cached) limiter.consume(userId, today);

      let parsed: ParsedFlightSearch & { fetchedAt: string };
      try {
        parsed = await cache.get(key, async () => ({
          ...(await client.searchFlights(query)),
          fetchedAt: now().toISOString(),
        }));
      } catch (err) {
        if (!cached) limiter.refund(userId, today);
        throw err;
      }

      const prices = parsed.options.map((o) => o.price).filter((p): p is number => p != null);

      return {
        query,
        currency: "KRW",
        lowestPrice: prices.length > 0 ? Math.min(...prices) : null,
        options: parsed.options,
        priceInsights: parsed.priceInsights,
        googleFlightsUrl: parsed.googleFlightsUrl,
        fetchedAt: parsed.fetchedAt,
        remainingSearches: limiter.remaining(userId, today),
        cached,
      };
    },

    remaining: (userId: string) => limiter.remaining(userId, kstDate(now())),
  };
}

export type FlightsService = ReturnType<typeof createFlightsService>;

let singleton: FlightsService | null = null;

/** 캐시·한도를 프로세스 전체가 같이 쓰도록 하나만 만든다 */
export function getFlightsService(): FlightsService {
  singleton ??= createFlightsService();
  return singleton;
}
