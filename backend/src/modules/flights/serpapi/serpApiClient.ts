import { env } from "../../../config/env.js";
import { HttpError } from "../../../lib/httpError.js";
import type {
  FlightOption,
  FlightSearchQuery,
  FlightSegment,
  Layover,
  ParsedFlightSearch,
  PriceInsights,
} from "../flights.types.js";

/**
 * SerpApi Google Flights 엔진 클라이언트 — https://serpapi.com/google-flights-api
 *
 * 항공사·OTA 화면을 직접 긁지 않고, Google 항공편 검색 결과를 JSON 으로 주는 SerpApi 를 쓴다.
 * (직접 크롤링은 봇 차단·약관 문제가 있고, 서버 한 대에서 헤드리스 브라우저를 띄우면 메모리가 모자란다)
 *
 * - 무료 요금제는 월 250회라, 호출을 아끼는 캐시·일일 한도는 `flights.service.ts` 가 맡는다.
 * - 왕복(type=1)은 가는 편 목록과 **왕복 총액**만 온다. 오는 편은 `departure_token` 으로 한 번 더 불러야 해서
 *   호출 수를 아끼려고 부르지 않고, Google 항공편 링크로 넘긴다.
 */

export interface SerpApiClient {
  searchFlights(query: FlightSearchQuery): Promise<ParsedFlightSearch>;
}

export interface SerpApiClientOptions {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
}

/** SerpApi 는 Google 응답을 기다리느라 수 초 이상 걸릴 때가 있다 */
const TIMEOUT_MS = 30_000;

/** 결과가 없을 때 SerpApi 가 주는 오류 문구. 예외가 아니라 빈 결과로 본다 */
const NO_RESULTS_PATTERN = /hasn't returned any results/i;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const obj = (v: unknown): Record<string, unknown> =>
  v != null && typeof v === "object" ? (v as Record<string, unknown>) : {};

function parseAirport(v: unknown): { id: string; name: string; time: string } {
  const a = obj(v);
  const id = str(a.id) ?? "";
  return { id, name: str(a.name) ?? id, time: str(a.time) ?? "" };
}

function parseSegment(v: unknown): FlightSegment {
  const s = obj(v);
  const dep = parseAirport(s.departure_airport);
  const arr = parseAirport(s.arrival_airport);

  return {
    airline: str(s.airline) ?? "",
    airlineLogo: str(s.airline_logo),
    flightNumber: str(s.flight_number) ?? "",
    departureAirport: { id: dep.id, name: dep.name },
    departureTime: dep.time,
    arrivalAirport: { id: arr.id, name: arr.name },
    arrivalTime: arr.time,
    durationMinutes: num(s.duration),
    airplane: str(s.airplane),
    travelClass: str(s.travel_class),
  };
}

function parseLayover(v: unknown): Layover {
  const l = obj(v);
  const id = str(l.id) ?? "";
  return {
    id,
    name: str(l.name) ?? id,
    durationMinutes: num(l.duration),
    overnight: l.overnight === true,
  };
}

/** best_flights / other_flights 항목 하나 → FlightOption. 구간이 없으면 null */
export function parseOption(v: unknown, best: boolean): FlightOption | null {
  const o = obj(v);
  const segments = Array.isArray(o.flights) ? o.flights.map(parseSegment) : [];
  if (segments.length === 0) return null;

  const first = segments[0];
  const last = segments[segments.length - 1];
  const layovers = Array.isArray(o.layovers) ? o.layovers.map(parseLayover) : [];

  return {
    id: segments.map((s) => `${s.flightNumber}@${s.departureTime}`).join("|"),
    price: num(o.price),
    totalDurationMinutes: num(o.total_duration),
    stops: segments.length - 1,
    airlines: [...new Set(segments.map((s) => s.airline).filter(Boolean))],
    departureTime: first.departureTime,
    arrivalTime: last.arrivalTime,
    segments,
    layovers,
    best,
  };
}

function parsePriceInsights(v: unknown): PriceInsights | null {
  if (v == null || typeof v !== "object") return null;
  const p = obj(v);
  const range = Array.isArray(p.typical_price_range) ? p.typical_price_range.map(num) : [];

  return {
    lowestPrice: num(p.lowest_price),
    priceLevel: str(p.price_level),
    typicalRange: range.length === 2 && range[0] != null && range[1] != null ? [range[0], range[1]] : null,
  };
}

/**
 * 가격 오름차순 정렬. 가격이 없는 항목은 맨 뒤, 가격이 같으면 소요 시간이 짧은 순.
 * 같은 여정이 best/other 에 함께 있으면 하나만 남긴다 (best 표시는 유지).
 */
export function sortAndDedupe(options: FlightOption[]): FlightOption[] {
  const byId = new Map<string, FlightOption>();

  for (const option of options) {
    const prev = byId.get(option.id);
    if (!prev) {
      byId.set(option.id, option);
      continue;
    }
    const cheaper = prev.price == null || (option.price != null && option.price < prev.price) ? option : prev;
    byId.set(option.id, { ...cheaper, best: prev.best || option.best });
  }

  const rank = (o: FlightOption) => o.price ?? Number.POSITIVE_INFINITY;
  const duration = (o: FlightOption) => o.totalDurationMinutes ?? Number.POSITIVE_INFINITY;

  return [...byId.values()].sort((a, b) => rank(a) - rank(b) || duration(a) - duration(b));
}

/** SerpApi 응답 본문 → 정리된 결과. 결과 없음 오류는 빈 결과로 돌려준다 */
export function parseSearchResponse(body: unknown): ParsedFlightSearch {
  const b = obj(body);
  const error = str(b.error);
  const googleFlightsUrl = str(obj(b.search_metadata).google_flights_url);

  if (error) {
    if (NO_RESULTS_PATTERN.test(error)) {
      return { options: [], priceInsights: null, googleFlightsUrl };
    }
    throw new HttpError(503, "SERPAPI_ERROR", `항공권 검색에 실패했습니다: ${error}`);
  }

  const options = [
    ...(Array.isArray(b.best_flights) ? b.best_flights.map((v) => parseOption(v, true)) : []),
    ...(Array.isArray(b.other_flights) ? b.other_flights.map((v) => parseOption(v, false)) : []),
  ].filter((o): o is FlightOption => o != null);

  return {
    options: sortAndDedupe(options),
    priceInsights: parsePriceInsights(b.price_insights),
    googleFlightsUrl,
  };
}

/** 검색 조건 → SerpApi 쿼리스트링 (api_key 제외) */
export function buildSearchParams(query: FlightSearchQuery): URLSearchParams {
  const params = new URLSearchParams({
    engine: "google_flights",
    departure_id: query.from,
    arrival_id: query.to,
    outbound_date: query.date,
    type: query.tripType === "round" ? "1" : "2",
    adults: String(query.adults),
    currency: "KRW",
    hl: "ko",
    gl: "kr",
  });
  if (query.tripType === "round" && query.returnDate) {
    params.set("return_date", query.returnDate);
  }
  return params;
}

export function createSerpApiClient(options: SerpApiClientOptions): SerpApiClient {
  const doFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  return {
    async searchFlights(query) {
      const params = buildSearchParams(query);
      params.set("api_key", options.apiKey);

      let res: Response;
      try {
        res = await doFetch(`${baseUrl}/search.json?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new HttpError(503, "SERPAPI_UNREACHABLE", `SerpApi 에 연결하지 못했습니다: ${reason}`);
      }

      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // 본문이 JSON 이 아니면 아래에서 상태코드로 처리한다
      }

      if (!res.ok) {
        // 401(잘못된 키)·429(월 한도 소진) 등. 메시지는 SerpApi 가 준 것을 그대로 전달한다.
        // 502/504 는 Cloudflare 가 본문을 바꿔 버리므로 503 으로 내린다.
        const error = str(obj(body).error);
        if (error && NO_RESULTS_PATTERN.test(error)) return parseSearchResponse(body);
        throw new HttpError(503, "SERPAPI_ERROR", `항공권 검색에 실패했습니다 (${res.status}): ${error ?? "알 수 없는 오류"}`);
      }

      return parseSearchResponse(body);
    },
  };
}

let singleton: SerpApiClient | null = null;

/** 키가 없으면 null — 검색 요청만 503 이 되고 앱은 그대로 뜬다 */
export function getSerpApiClient(): SerpApiClient | null {
  if (!env.SERPAPI_API_KEY) return null;
  singleton ??= createSerpApiClient({ apiKey: env.SERPAPI_API_KEY, baseUrl: env.SERPAPI_BASE_URL });
  return singleton;
}
