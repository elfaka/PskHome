import { HttpError } from "../../lib/httpError.js";
import { TtlCache } from "../../lib/ttlCache.js";
import { kstDate } from "./indicators.js";
import * as marketData from "./marketData.service.js";
import type { TossInvestorTradingRanking, TossInvestorTradingRecord } from "./toss/toss.types.js";
import { getTossClient } from "./toss/tossClient.js";
import type {
  IntradayFlowPoint,
  IntradayFlows,
  InvestorRankingItem,
  InvestorRankings,
  RankingInvestor,
} from "./stockSim.types.js";

/**
 * 투자자 동향 확장 — 장중 외국인·기관 수급 흐름과 투자자별 순매수·순매도 상위 종목.
 *
 * ## 장중 흐름
 * 토스는 종목별 투자자 매매동향을 **일별로만** 준다. 당일 기록은 장중 잠정치로 갱신되며 `updatedAt` 이 바뀐다.
 * 그래서 서버가 당일 기록을 받을 때마다 `updatedAt` 별로 쌓아 시간 흐름을 만든다.
 * - 오늘(KST) 기록만 쌓는다. 같은 `updatedAt` 은 한 번만.
 * - 오늘 조회된 종목은 최대 `MAX_TRACKED` 개까지 장중에 `SAMPLE_INTERVAL_MS` 마다 백그라운드로 받는다.
 * - 메모리에만 두므로 서버가 다시 시작되면 사라지고, 처음 조회하기 전 시간은 채울 수 없다.
 *
 * ## 순위
 * `GET /api/v1/rankings/investor-trading` — 최근 영업일 기준, 과거 날짜 조회 불가.
 * 종목명은 국내 종목 목록에서, 등락률은 현재가·최근 일봉으로 붙인다 (못 받아도 순위는 보여준다).
 *
 * | 데이터 | 캐시 |
 * |---|---|
 * | 당일 매매동향 (1건) | 1분 |
 * | 투자자별 순위 | 5분 |
 */

const MAX_TRACKED = 20;
const SAMPLE_INTERVAL_MS = 5 * 60_000;
/** 한 종목·하루에 쌓는 스냅샷 상한 (5분 간격이면 하루 80개 남짓) */
const MAX_POINTS = 300;
const RANKING_COUNT = 20;
/**
 * 등락률을 붙일 때 한 번에 조회하는 종목 수. 종목마다 일봉을 조회하는데, 차트 일봉과 같은 한도(초당 20회)를 쓴다.
 * 순위를 받는 동안에도 차트가 한도를 절반은 쓸 수 있게 초당 10회 안쪽으로 나눠 받는다.
 */
const QUOTE_CHUNK = 5;

/** 등락률 조회 묶음 사이 간격 (테스트는 0) */
export const rankingThrottle = { intervalMs: 500 };

/**
 * 장중 수집에서 종목 사이 간격 (테스트는 0).
 * 매매동향 한도(초당 10회)를 수집이 혼자 다 쓰면 그 순간 화면의 수급·매매 신호 조회가 거절된다.
 */
export const samplerThrottle = { intervalMs: 250 };

const latestCache = new TtlCache<TossInvestorTradingRecord | null>(60_000);
const rankingRawCache = new TtlCache<TossInvestorTradingRanking>(5 * 60_000);
const rankingCache = new TtlCache<InvestorRankings>(5 * 60_000);

/** 종목별 오늘 스냅샷 */
const snapshots = new Map<string, { date: string; points: IntradayFlowPoint[] }>();
/** 종목별 마지막 조회 시각 (ms) */
const tracked = new Map<string, number>();
let sampler: NodeJS.Timeout | null = null;

export function resetInvestorFlowState(): void {
  latestCache.clear();
  rankingRawCache.clear();
  rankingCache.clear();
  snapshots.clear();
  tracked.clear();
}

const INVESTORS: readonly RankingInvestor[] = ["foreigner", "institution", "individual"];

export function parseRankingInvestor(raw: unknown): RankingInvestor {
  if (raw == null) return "foreigner";
  if (typeof raw === "string" && (INVESTORS as readonly string[]).includes(raw)) return raw as RankingInvestor;

  throw HttpError.badRequest(`investor 는 ${INVESTORS.join(", ")} 중 하나여야 합니다.`, "INVALID_PARAM");
}

/** 평일 KST 09:00~15:40 (정규장 + 마감 직후 잠정치 반영). 휴장일은 기록 날짜로 걸러진다 */
export function isMarketHours(now: Date): boolean {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const dow = kst.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return minutes >= 9 * 60 && minutes <= 15 * 60 + 40;
}

/** 당일 기록을 스냅샷으로 쌓는다. 오늘 기록이 아니거나 이미 있는 갱신 시각이면 무시한다 */
export function recordSnapshot(symbol: string, record: TossInvestorTradingRecord, today: string): void {
  if (record.date !== today) return;

  let day = snapshots.get(symbol);
  if (!day || day.date !== today) {
    day = { date: today, points: [] };
    snapshots.set(symbol, day);
  }
  if (day.points.some((p) => p.at === record.updatedAt)) return;

  day.points.push({
    at: record.updatedAt,
    foreigner: Number(record.foreigner.netBuyVolume),
    institution: Number(record.institution.netBuyVolume),
  });
  day.points.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (day.points.length > MAX_POINTS) day.points.splice(0, day.points.length - MAX_POINTS);
}

async function fetchLatest(symbol: string): Promise<TossInvestorTradingRecord | null> {
  return latestCache.get(symbol, async () => (await getTossClient().getInvestorTrading(symbol, 1)).records[0] ?? null);
}

/** 오늘 외국인·기관 순매수 흐름. 조회한 종목은 장중 백그라운드 수집 대상이 된다 */
export async function getIntradayFlows(rawSymbol: string, now = new Date()): Promise<IntradayFlows> {
  const [symbol] = marketData.normalizeSymbols([rawSymbol]);
  const today = kstDate(now.toISOString());

  tracked.set(symbol, now.getTime());
  const latest = await fetchLatest(symbol);
  if (latest) recordSnapshot(symbol, latest, today);

  const day = snapshots.get(symbol);
  return {
    symbol,
    date: today,
    latestDate: latest?.date ?? null,
    points: day?.date === today ? [...day.points] : [],
    collecting: isMarketHours(now),
  };
}

/** 오늘 조회된 종목 중 최근에 본 순으로 최대 MAX_TRACKED 개 */
export function trackedSymbols(now: Date): string[] {
  const today = kstDate(now.toISOString());
  for (const [symbol, at] of tracked) {
    if (kstDate(new Date(at).toISOString()) !== today) tracked.delete(symbol);
  }
  for (const [symbol, day] of snapshots) {
    if (day.date !== today) snapshots.delete(symbol);
  }
  return [...tracked.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TRACKED)
    .map(([symbol]) => symbol);
}

/** 장중이면 추적 중인 종목의 당일 기록을 하나씩 받아 쌓는다. 실패한 종목은 건너뛴다 */
export async function sampleTrackedSymbols(now = new Date()): Promise<number> {
  if (!isMarketHours(now)) return 0;

  const today = kstDate(now.toISOString());
  const client = getTossClient();
  let recorded = 0;

  for (const [i, symbol] of trackedSymbols(now).entries()) {
    if (i > 0 && samplerThrottle.intervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, samplerThrottle.intervalMs));
    }
    try {
      const record = (await client.getInvestorTrading(symbol, 1)).records[0];
      if (record) {
        recordSnapshot(symbol, record, today);
        recorded++;
      }
    } catch {
      // 다음 주기에 다시 받는다
    }
  }

  return recorded;
}

/** 백그라운드 수집 시작 (index.ts 에서 한 번). 프로세스 종료를 막지 않는다 */
export function startIntradaySampler(): void {
  if (sampler) return;
  sampler = setInterval(() => void sampleTrackedSymbols(), SAMPLE_INTERVAL_MS);
  sampler.unref();
}

async function quotesInChunks(symbols: string[]) {
  const out = new Map<string, { price: number; changeRate: number | null }>();

  for (let i = 0; i < symbols.length; i += QUOTE_CHUNK) {
    if (i > 0 && rankingThrottle.intervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, rankingThrottle.intervalMs));
    }
    const quotes = await marketData.getQuotesWithChange(symbols.slice(i, i + QUOTE_CHUNK)).catch(() => []);
    for (const q of quotes) out.set(q.symbol, { price: q.price, changeRate: q.changeRate });
  }

  return out;
}

/** 투자자별 순매수·순매도 상위 종목 (각 최대 20개) */
export async function getInvestorRankings(investor: RankingInvestor): Promise<InvestorRankings> {
  return rankingCache.get(investor, async () => {
    const all = await rankingRawCache.get("all", () => getTossClient().getInvestorTradingRankings(RANKING_COUNT));
    const ranking = all[investor];

    const buys = ranking.netBuyRankings.map((r) => ({ rank: r.rank, symbol: r.symbol, amount: Number(r.netBuyAmount) }));
    const sells = ranking.netSellRankings.map((r) => ({ rank: r.rank, symbol: r.symbol, amount: Number(r.netSellAmount) }));
    const symbols = [...new Set([...buys, ...sells].map((r) => r.symbol))];

    const [names, quotes] = await Promise.all([
      symbols.length > 0 ? marketData.getStockNames(symbols).catch(() => new Map<string, string>()) : new Map<string, string>(),
      quotesInChunks(symbols),
    ]);

    const enrich = (r: { rank: number; symbol: string; amount: number }): InvestorRankingItem => ({
      ...r,
      name: names.get(r.symbol) ?? null,
      price: quotes.get(r.symbol)?.price ?? null,
      changeRate: quotes.get(r.symbol)?.changeRate ?? null,
    });

    return { investor, rankedAt: ranking.rankedAt, netBuy: buys.map(enrich), netSell: sells.map(enrich) };
  });
}
