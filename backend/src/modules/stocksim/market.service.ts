import { HttpError } from "../../lib/httpError.js";
import { TtlCache } from "../../lib/ttlCache.js";
import { aggregateCandles, kstDate, last, rsi, sma } from "./indicators.js";
import { buildChartIndicators } from "./marketData.service.js";
import type { TossIndicatorPrice, TossIndicatorSymbol } from "./toss/toss.types.js";
import { getTossClient } from "./toss/tossClient.js";
import type {
  CandlePoint,
  ChartData,
  FearGreed,
  FearGreedFactor,
  FearGreedLevel,
  MarketIndex,
  MarketIndexSymbol,
  MarketInvestorDay,
  MarketOverview,
  Timeframe,
} from "./stockSim.types.js";

/**
 * 시장 화면 — 코스피·코스닥 지수와 자체 계산 공포·탐욕 지수.
 *
 * 토스 시장 지표 API(`/api/v1/market-indicators/...`)만 쓴다.
 *
 * | 데이터 | 토스 한도(초당) | 캐시 |
 * |---|---|---|
 * | 지수 현재가 | 10회 | 3초 |
 * | 지수 1분봉 / 일봉 | 5회 (MARKET_INDICATOR_CHART) | 1분봉 20초, 일봉 5분 — 호출 간격을 `marketThrottle` 로 벌린다 |
 * | 시장 투자자별 매매대금 | 10회 | 5분 |
 *
 * [공포·탐욕 지수]
 * 한국 시장에는 공식 지수가 없어 CNN Fear & Greed 와 같은 방식으로 직접 계산한다.
 * 항목마다 0(공포)~100(탐욕) 점수를 내고, 구할 수 있는 항목만 평균한다.
 *
 * | 항목 | 값 | 0점 ↔ 100점 |
 * |---|---|---|
 * | 모멘텀 | 코스피 ÷ 125일선 - 1 | -10% ↔ +10% |
 * | 과열도 | 코스피 RSI(14) | RSI 값 그대로 |
 * | 변동성 | 20일 변동성 ÷ 1년 변동성 | 1.5배 ↔ 0.5배 |
 * | 위험 선호 | 코스닥 20일 수익률 - 코스피 20일 수익률 | -5%p ↔ +5%p |
 * | 안전자산 선호 | 코스피 20일 수익률(%) + 국고채 10년 금리 20일 변화(%p) × 10 | -10 ↔ +10 |
 * | 수급 | 최근 5일 외국인+기관 순매수 ÷ 시장 거래대금 | -5% ↔ +5% |
 *
 * 안전자산 선호: 채권으로 돈이 몰리면 금리가 내려간다. 금리 변화 × 10 은 10년물 채권 가격 변화를 대략 뒤집은 값이다.
 * 등급: 0~24 극단적 공포, 25~44 공포, 45~55 중립, 56~75 탐욕, 76~100 극단적 탐욕.
 */

export const FEAR_GREED_DISCLAIMER =
  "코스피·코스닥 지수, 국고채 금리, 투자자별 매매대금으로 직접 계산한 참고 지표이며 공식 공포·탐욕 지수가 아닙니다.";

const INDEX_NAMES: Record<MarketIndexSymbol, string> = { KOSPI: "코스피", KOSDAQ: "코스닥" };
const INDEX_SYMBOLS: MarketIndexSymbol[] = ["KOSPI", "KOSDAQ"];

/** 토스 시장 지표 캔들 한 번 조회 상한 */
const CANDLE_PAGE = 200;
/** 지수 일봉 — 공포탐욕(1년 변동성 + 1개월 전 값)과 일·주·월봉 차트가 같이 쓴다 (약 1.6년) */
const INDEX_DAILY = 400;
/** 지수 1분봉 — 정규장 하루(390분) 반 */
const INDEX_MINUTES = 600;
const BOND_DAILY = 60;
const FLOW_DAYS = 30;

/** 캔들 조회 사이 최소 간격. 토스 한도(초당 5회)보다 넉넉히 둔다. 테스트는 0 으로 바꾼다. */
export const marketThrottle = { intervalMs: 250 };

const priceCache = new TtlCache<TossIndicatorPrice[]>(3_000);
const dailyCache = new TtlCache<CandlePoint[]>(5 * 60_000);
const minuteCache = new TtlCache<CandlePoint[]>(20_000);
const investorCache = new TtlCache<MarketInvestorDay[]>(5 * 60_000);
const fearGreedCache = new TtlCache<FearGreed>(5 * 60_000);
let nextSlot = 0;

export function resetMarketCache(): void {
  priceCache.clear();
  dailyCache.clear();
  minuteCache.clear();
  investorCache.clear();
  fearGreedCache.clear();
  nextSlot = 0;
}

async function throttled<T>(call: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + marketThrottle.intervalMs;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  return call();
}

export function parseIndexSymbol(raw: string): MarketIndexSymbol {
  const symbol = raw.trim().toUpperCase();
  if (symbol === "KOSPI" || symbol === "KOSDAQ") return symbol;
  throw HttpError.badRequest("지수는 KOSPI, KOSDAQ 중 하나여야 합니다.", "INVALID_SYMBOL");
}

/** 봉을 `count` 개까지 이어 받아 오래된 것부터 돌려준다 (marketData 의 fetchCandles 와 같은 방식). */
async function fetchIndicatorCandles(
  symbol: TossIndicatorSymbol,
  interval: "1m" | "1d",
  count: number
): Promise<CandlePoint[]> {
  const client = getTossClient();
  const byTime = new Map<string, CandlePoint>();
  let before: string | undefined;

  while (byTime.size < count) {
    const page = await throttled(() =>
      client.getIndicatorCandles(symbol, interval, Math.min(CANDLE_PAGE, count - byTime.size), before)
    );

    for (const c of page.candles) {
      byTime.set(c.timestamp, {
        time: c.timestamp,
        open: Number(c.openPrice),
        high: Number(c.highPrice),
        low: Number(c.lowPrice),
        close: Number(c.closePrice),
        volume: Number(c.volume),
      });
    }

    if (!page.nextBefore || page.candles.length === 0) break;
    before = page.nextBefore;
  }

  // 시각 문자열의 오프셋이 섞여도 순서가 맞도록 숫자로 정렬한다.
  return [...byTime.values()].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

function getDaily(symbol: TossIndicatorSymbol): Promise<CandlePoint[]> {
  return dailyCache.get(symbol, () => fetchIndicatorCandles(symbol, "1d", symbol === "KR_BOND_10Y" ? BOND_DAILY : INDEX_DAILY));
}

function getMinutes(symbol: MarketIndexSymbol): Promise<CandlePoint[]> {
  return minuteCache.get(symbol, () => fetchIndicatorCandles(symbol, "1m", INDEX_MINUTES));
}

/** 시장 전체 투자자별 순매수 대금 (최신순, 30거래일) */
export async function getMarketInvestors(rawSymbol: string): Promise<MarketInvestorDay[]> {
  const symbol = parseIndexSymbol(rawSymbol);

  return investorCache.get(symbol, async () => {
    const page = await getTossClient().getMarketInvestorTrading(symbol, FLOW_DAYS);
    const net = (a: { buyAmount: string; sellAmount: string }) => Number(a.buyAmount) - Number(a.sellAmount);

    return page.records.map((r) => ({
      date: r.date,
      individual: net(r.individual),
      foreigner: net(r.foreigner),
      institution: net(r.institution),
      otherCorporation: net(r.otherCorporation),
      // 네 분류의 매수 합 = 시장 전체 거래대금
      tradingValue: [r.individual, r.foreigner, r.institution, r.otherCorporation].reduce(
        (sum, a) => sum + Number(a.buyAmount),
        0
      ),
    }));
  });
}

/** 지수 차트 — 종목 차트와 같은 형태 (봉 + 지표) */
export async function getIndexChart(rawSymbol: string, timeframe: Timeframe): Promise<ChartData> {
  const symbol = parseIndexSymbol(rawSymbol);

  let candles: CandlePoint[];
  switch (timeframe) {
    case "1m":
      candles = await getMinutes(symbol);
      break;
    case "5m":
    case "15m":
      candles = aggregateCandles(await getMinutes(symbol), timeframe);
      break;
    case "1d":
      candles = await getDaily(symbol);
      break;
    case "1w":
    case "1M":
      candles = aggregateCandles(await getDaily(symbol), timeframe);
      break;
  }

  return { symbol, timeframe, candles, indicators: buildChartIndicators(candles) };
}

/**
 * 전일 종가. 현재값 날짜의 일봉이 있으면 그 전 봉, 없으면(장 시작 전) 마지막 봉이다.
 * `daily` 는 오래된 것부터.
 */
export function previousClose(daily: CandlePoint[], timestamp: string | null): number | null {
  const lastBar = daily[daily.length - 1];
  if (!lastBar) return null;
  if (timestamp && kstDate(timestamp) === kstDate(lastBar.time)) return daily[daily.length - 2]?.close ?? null;
  return lastBar.close;
}

/** 마지막 거래일의 5분 간격 종가 */
export function intradayLine(minutes: CandlePoint[]): MarketIndex["intraday"] {
  const lastBar = minutes[minutes.length - 1];
  if (!lastBar) return [];
  const day = kstDate(lastBar.time);

  return aggregateCandles(
    minutes.filter((m) => kstDate(m.time) === day),
    "5m"
  ).map((c) => ({ time: c.time, value: c.close }));
}

async function loadIndex(symbol: MarketIndexSymbol, price: TossIndicatorPrice): Promise<MarketIndex> {
  // 등락·추이를 못 구해도 지수 값은 보여준다.
  const [daily, minutes] = await Promise.all([
    getDaily(symbol).catch(() => [] as CandlePoint[]),
    getMinutes(symbol).catch(() => [] as CandlePoint[]),
  ]);

  const value = Number(price.lastPrice);
  // 토스가 지수 현재가 시각을 null 로 줄 때가 있다(실서버에서 확인). 그러면 마지막 1분봉 시각을 쓴다.
  // 시각을 모르면 오늘 일봉을 전일로 착각해 등락이 0 이 된다.
  const timestamp = price.timestamp ?? minutes[minutes.length - 1]?.time ?? null;
  const prevClose = previousClose(daily, timestamp);
  const change = prevClose != null ? value - prevClose : null;

  return {
    symbol,
    name: INDEX_NAMES[symbol],
    value,
    timestamp,
    prevClose,
    change,
    changeRate: change != null && prevClose ? change / prevClose : null,
    intraday: intradayLine(minutes),
  };
}

/** 상단 지수 띠 + 공포·탐욕. 지수 현재가를 못 받으면 실패, 공포·탐욕은 실패해도 이유만 남긴다. */
export async function getMarketOverview(): Promise<MarketOverview> {
  const prices = await priceCache.get("indices", () => getTossClient().getIndicatorPrices(INDEX_SYMBOLS));

  const indices = await Promise.all(
    INDEX_SYMBOLS.flatMap((symbol) => {
      const price = prices.find((p) => p.symbol === symbol);
      return price ? [loadIndex(symbol, price)] : [];
    })
  );

  let fearGreed: FearGreed | null = null;
  let fearGreedNote: string | null = null;
  try {
    fearGreed = await getFearGreed();
  } catch (err) {
    fearGreedNote = `공포·탐욕 지수를 계산하지 못했습니다: ${err instanceof Error ? err.message : String(err)}`;
  }

  return { indices, fearGreed, fearGreedNote };
}

export async function getFearGreed(): Promise<FearGreed> {
  return fearGreedCache.get("KOSPI", async () => {
    // 캔들은 한도가 낮아 순서대로 받는다 (throttled 가 간격도 벌린다).
    const kospi = await getDaily("KOSPI");
    const kosdaq = await getDaily("KOSDAQ").catch(() => null);
    const bond = await getDaily("KR_BOND_10Y").catch(() => null);
    const flows = await getMarketInvestors("KOSPI").catch(() => null);

    return computeFearGreed({ kospi, kosdaq, bond, flows });
  });
}

// ---------------------------------------------------------------------------
// 공포·탐욕 계산 (순수 함수)
// ---------------------------------------------------------------------------

export interface FearGreedInput {
  /** 오래된 것부터 */
  kospi: CandlePoint[];
  kosdaq: CandlePoint[] | null;
  /** 국고채 10년 금리(%) 일봉, 오래된 것부터 */
  bond: CandlePoint[] | null;
  /** 최신순 */
  flows: MarketInvestorDay[] | null;
}

const LEVEL_LABEL: Record<FearGreedLevel, string> = {
  EXTREME_FEAR: "극단적 공포",
  FEAR: "공포",
  NEUTRAL: "중립",
  GREED: "탐욕",
  EXTREME_GREED: "극단적 탐욕",
};

export function fearGreedLevel(score: number): FearGreedLevel {
  if (score < 25) return "EXTREME_FEAR";
  if (score < 45) return "FEAR";
  if (score <= 55) return "NEUTRAL";
  if (score <= 75) return "GREED";
  return "EXTREME_GREED";
}

/** `from` 이 0점, `to` 가 100점인 선형 점수 (0~100 으로 자른다). from > to 면 뒤집힌다. */
export function linearScore(value: number, from: number, to: number): number {
  return Math.round(Math.min(100, Math.max(0, ((value - from) / (to - from)) * 100)));
}

const signedPct = (v: number, digits = 1) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;

function krwCompact(v: number): string {
  const sign = v < 0 ? "-" : "+";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}조원`;
  return `${sign}${Math.round(abs / 1e8).toLocaleString("ko-KR")}억원`;
}

function returnOver(closes: number[], days: number): number | null {
  if (closes.length <= days) return null;
  const base = closes[closes.length - 1 - days];
  return base ? closes[closes.length - 1] / base - 1 : null;
}

function stdev(values: number[]): number {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

function unavailable(key: FearGreedFactor["key"], label: string, reason: string): FearGreedFactor {
  return { key, label, score: null, value: "-", reason };
}

function momentumFactor(closes: number[]): FearGreedFactor {
  const ma125 = last(sma(closes, 125));
  if (ma125 == null) return unavailable("momentum", "모멘텀", "125거래일 이상의 지수 데이터가 필요합니다.");

  const gap = closes[closes.length - 1] / ma125 - 1;
  return {
    key: "momentum",
    label: "모멘텀",
    score: linearScore(gap, -0.1, 0.1),
    value: `125일선 대비 ${signedPct(gap)}`,
    reason:
      gap >= 0
        ? "코스피가 125일 이동평균 위에 있어 상승 추세입니다."
        : "코스피가 125일 이동평균 아래에 있어 하락 추세입니다.",
  };
}

function rsiFactor(closes: number[]): FearGreedFactor {
  const value = last(rsi(closes, 14));
  if (value == null) return unavailable("rsi", "과열도", "RSI 를 계산할 지수 데이터가 부족합니다.");

  return {
    key: "rsi",
    label: "과열도",
    score: Math.round(value),
    value: `RSI(14) ${value.toFixed(1)}`,
    reason:
      value >= 70
        ? "과매수 구간으로 매수세가 과열됐습니다."
        : value <= 30
          ? "과매도 구간으로 매도세가 과도합니다."
          : "과열·과매도 어느 쪽도 아닙니다.",
  };
}

function volatilityFactor(closes: number[]): FearGreedFactor {
  const returns = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  if (returns.length < 60) return unavailable("volatility", "변동성", "60거래일 이상의 지수 데이터가 필요합니다.");

  const short = stdev(returns.slice(-20));
  const long = stdev(returns.slice(-250));
  if (long === 0) return unavailable("volatility", "변동성", "변동성을 계산할 수 없습니다.");

  const ratio = short / long;
  const annualized = short * Math.sqrt(250);
  return {
    key: "volatility",
    label: "변동성",
    score: linearScore(ratio, 1.5, 0.5),
    value: `20일 ${(annualized * 100).toFixed(1)}% (1년 평균의 ${ratio.toFixed(2)}배)`,
    reason:
      ratio > 1.15
        ? "평소보다 변동성이 커 불안 심리가 높습니다."
        : ratio < 0.85
          ? "평소보다 변동성이 낮아 시장이 안정적입니다."
          : "변동성이 평소 수준입니다.",
  };
}

function riskAppetiteFactor(kospi: number[], kosdaq: number[] | null): FearGreedFactor {
  const kospiRet = returnOver(kospi, 20);
  const kosdaqRet = kosdaq ? returnOver(kosdaq, 20) : null;
  if (kospiRet == null || kosdaqRet == null) {
    return unavailable("riskAppetite", "위험 선호", "코스닥 지수 데이터를 받지 못했습니다.");
  }

  const diff = kosdaqRet - kospiRet;
  return {
    key: "riskAppetite",
    label: "위험 선호",
    score: linearScore(diff, -0.05, 0.05),
    value: `20일 코스닥 ${signedPct(kosdaqRet)} · 코스피 ${signedPct(kospiRet)}`,
    reason:
      diff > 0.01
        ? "중소형주(코스닥)가 더 강해 위험을 감수하려는 심리입니다."
        : diff < -0.01
          ? "대형주(코스피)로 쏠려 위험을 피하려는 심리입니다."
          : "코스닥과 코스피의 흐름이 비슷합니다.",
  };
}

function safeHavenFactor(kospi: number[], bond: number[] | null): FearGreedFactor {
  const kospiRet = returnOver(kospi, 20);
  if (kospiRet == null || !bond || bond.length <= 20) {
    return unavailable("safeHaven", "안전자산 선호", "국고채 금리 데이터를 받지 못했습니다.");
  }

  const yieldChange = bond[bond.length - 1] - bond[bond.length - 21];
  const spread = kospiRet * 100 + yieldChange * 10;
  return {
    key: "safeHaven",
    label: "안전자산 선호",
    score: linearScore(spread, -10, 10),
    value: `코스피 20일 ${signedPct(kospiRet)} · 국고채 10년 ${yieldChange >= 0 ? "+" : ""}${yieldChange.toFixed(2)}%p`,
    reason:
      spread > 2
        ? "채권보다 주식을 선호하고 있습니다."
        : spread < -2
          ? "채권 같은 안전자산으로 자금이 몰리고 있습니다."
          : "주식과 안전자산 선호가 균형을 이룹니다.",
  };
}

function flowFactor(flows: MarketInvestorDay[] | null): FearGreedFactor {
  const recent = (flows ?? []).slice(0, 5);
  if (recent.length < 3) return unavailable("flow", "수급", "시장 투자자별 매매대금을 받지 못했습니다.");

  const smartMoney = recent.reduce((s, d) => s + d.foreigner + d.institution, 0);
  const total = recent.reduce((s, d) => s + d.tradingValue, 0);
  if (total <= 0) return unavailable("flow", "수급", "시장 거래대금이 없습니다.");

  const ratio = smartMoney / total;
  return {
    key: "flow",
    label: "수급",
    score: linearScore(ratio, -0.05, 0.05),
    value: `외국인·기관 ${recent.length}일 ${krwCompact(smartMoney)}`,
    reason:
      ratio > 0.005
        ? "외국인·기관이 순매수하고 있습니다."
        : ratio < -0.005
          ? "외국인·기관이 순매도하고 있습니다."
          : "외국인·기관 수급이 중립입니다.",
  };
}

/** `cut` 날짜(KST)까지의 데이터로 항목 점수를 낸다. */
function factorsUntil(input: FearGreedInput, cut: string): FearGreedFactor[] {
  const until = (bars: CandlePoint[] | null) => bars?.filter((b) => kstDate(b.time) <= cut).map((b) => b.close) ?? null;
  const kospi = until(input.kospi) ?? [];

  return [
    momentumFactor(kospi),
    rsiFactor(kospi),
    volatilityFactor(kospi),
    riskAppetiteFactor(kospi, until(input.kosdaq)),
    safeHavenFactor(kospi, until(input.bond)),
    flowFactor(input.flows?.filter((f) => f.date <= cut) ?? null),
  ];
}

function average(factors: FearGreedFactor[]): number | null {
  const scores = factors.flatMap((f) => (f.score == null ? [] : [f.score]));
  return scores.length === 0 ? null : Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
}

export function computeFearGreed(input: FearGreedInput): FearGreed {
  const bars = input.kospi;
  if (bars.length < 21) {
    throw new HttpError(503, "INSUFFICIENT_DATA", "코스피 지수 데이터가 부족합니다.");
  }

  const dateAt = (offset: number) => kstDate(bars[bars.length - 1 - offset].time);
  const asOf = dateAt(0);
  const factors = factorsUntil(input, asOf);
  const score = average(factors);
  if (score == null) {
    throw new HttpError(503, "INSUFFICIENT_DATA", "공포·탐욕 지수를 계산할 데이터가 부족합니다.");
  }

  const level = fearGreedLevel(score);
  const history = (
    [
      ["1주 전", 5],
      ["1개월 전", 21],
    ] as const
  ).map(([label, offset]) => ({
    label,
    score: bars.length > offset ? average(factorsUntil(input, dateAt(offset))) : null,
  }));

  return { score, level, label: LEVEL_LABEL[level], asOf, factors, history, disclaimer: FEAR_GREED_DISCLAIMER };
}
