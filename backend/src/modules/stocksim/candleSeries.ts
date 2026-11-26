import { TtlCache } from "../../lib/ttlCache.js";
import { kstDate } from "./indicators.js";
import type { CandlePoint } from "./stockSim.types.js";

/** 토스 캔들 한 페이지 — 최신순, 다음 페이지 기준 시각 */
export interface CandlePage {
  candles: CandlePoint[];
  nextBefore: string | null;
}

/** `before` 가 없으면 최신 봉부터 `count` 개 */
export type FetchCandlePage = (count: number, before?: string) => Promise<CandlePage>;

/** 토스 캔들 한 번 조회 상한 */
export const CANDLE_PAGE = 200;

const time = (c: CandlePoint) => Date.parse(c.time);

/**
 * 봉을 `count` 개까지 이어 받아 **오래된 것부터** 돌려준다.
 * 같은 시각의 봉은 하나만 남긴다 (시각 문자열의 오프셋 표기가 달라도 숫자로 비교한다).
 */
export async function fetchAllCandles(fetchPage: FetchCandlePage, count: number): Promise<CandlePoint[]> {
  const byTime = new Map<number, CandlePoint>();
  let before: string | undefined;

  while (byTime.size < count) {
    const page = await fetchPage(Math.min(CANDLE_PAGE, count - byTime.size), before);
    for (const c of page.candles) byTime.set(time(c), c);
    if (!page.nextBefore || page.candles.length === 0) break;
    before = page.nextBefore;
  }

  return [...byTime.values()].sort((a, b) => time(a) - time(b));
}

/**
 * 가진 봉에 최신 한 페이지를 이어 붙인다. 이어지지 않으면(사이가 비면) null.
 * 같은 시각의 봉은 새 값으로 덮어써 진행 중인 마지막 봉이 갱신된다.
 */
export function mergeLatest(prev: CandlePoint[], latest: CandlePoint[], count: number): CandlePoint[] | null {
  if (latest.length === 0) return prev;
  const prevLast = prev[prev.length - 1];
  if (!prevLast) return null;

  const oldestNew = Math.min(...latest.map(time));
  if (oldestNew > time(prevLast)) return null;

  const byTime = new Map<number, CandlePoint>(prev.map((c) => [time(c), c]));
  for (const c of latest) byTime.set(time(c), c);
  const merged = [...byTime.values()].sort((a, b) => time(a) - time(b));
  return merged.length > count ? merged.slice(merged.length - count) : merged;
}

/**
 * 봉 묶음 캐시. 만료되면 전체가 아니라 **최신 1페이지만** 받아 이어 붙인다.
 *
 * 토스 한도는 호출 횟수라 몇 개를 받든 한 페이지는 한 번이다. 그래서 최신 페이지는 꽉 채워 받는다
 * (마지막으로 받은 뒤 시간이 꽤 지났어도 이어질 가능성이 커진다).
 * 이어지지 않거나 KST 날짜가 바뀌면 전체를 다시 받는다 — 액면분할 등으로 과거 봉이 보정돼도 하루 안에 반영된다.
 */
export class CandleSeries {
  private readonly cache: TtlCache<CandlePoint[]>;
  private readonly history = new Map<string, { candles: CandlePoint[]; day: string }>();

  constructor(ttlMs: number) {
    this.cache = new TtlCache(ttlMs);
  }

  get(key: string, count: number, fetchPage: FetchCandlePage): Promise<CandlePoint[]> {
    return this.cache.get(key, async () => {
      const day = kstDate(new Date().toISOString());
      const prev = this.history.get(key);

      let candles: CandlePoint[] | null = null;
      if (prev && prev.day === day && prev.candles.length > 0) {
        const page = await fetchPage(Math.min(CANDLE_PAGE, count));
        candles = mergeLatest(prev.candles, page.candles, count);
      }
      candles ??= await fetchAllCandles(fetchPage, count);

      this.history.set(key, { candles, day });
      return candles;
    });
  }

  clear(): void {
    this.cache.clear();
    this.history.clear();
  }
}
