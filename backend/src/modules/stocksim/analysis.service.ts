import { bollinger, last, macd, maxDrawdown, rsi, sma } from "./indicators.js";
import * as marketData from "./marketData.service.js";
import { range52w, sessionBars } from "./overview.service.js";
import type {
  Analysis,
  AnalysisFactor,
  CandlePoint,
  InvestorFlowDay,
  Rating,
  Valuation,
} from "./stockSim.types.js";
import { getValuation } from "./valuation.js";

/**
 * 매수·매도 추천 — 규칙 기반 점수표.
 *
 * 머신러닝이 아니라 사람이 읽을 수 있는 규칙만 쓴다. 항목마다 점수와 사유 문장을 남겨
 * "왜 이 추천인지"를 화면에서 그대로 보여주기 위해서다.
 *
 * | 분류 | 항목 (최대 점수) |
 * |---|---|
 * | 추세 | 이동평균 배열(10), 120일선 대비(8), 20·60일선 교차(10) |
 * | 모멘텀 | RSI(15), MACD(12) |
 * | 위치 | 볼린저밴드(10), 52주 범위(6), 1년 수익률·최대낙폭(참고) |
 * | 수급 | 외국인(8), 기관(8), 공매도 비중(6) |
 * | 가치 | PER(8), PBR(6), ROE(6) |
 *
 * 합계를 -100~100 으로 자르고 5단계로 나눈다. 데이터가 없는 항목은 0점으로 두고 "데이터 없음"을 적는다.
 */

export const DISCLAIMER =
  "규칙 기반으로 계산한 교육용 신호이며 투자 권유가 아닙니다. 실제 투자 판단과 그 결과의 책임은 본인에게 있습니다.";

const RATING_LABEL: Record<Rating, string> = {
  STRONG_BUY: "강력 매수",
  BUY: "매수",
  NEUTRAL: "중립",
  SELL: "매도",
  STRONG_SELL: "강력 매도",
};

export function ratingOf(score: number): Rating {
  if (score >= 35) return "STRONG_BUY";
  if (score >= 12) return "BUY";
  if (score > -12) return "NEUTRAL";
  if (score > -35) return "SELL";
  return "STRONG_SELL";
}

const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
const shares = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}주`;

function factor(
  key: string,
  category: AnalysisFactor["category"],
  label: string,
  maxScore: number,
  score: number,
  reason: string
): AnalysisFactor {
  return {
    key,
    category,
    label,
    score,
    maxScore,
    signal: score > 0 ? "positive" : score < 0 ? "negative" : "neutral",
    reason,
  };
}

function unavailable(
  key: string,
  category: AnalysisFactor["category"],
  label: string,
  maxScore: number,
  reason: string
): AnalysisFactor {
  return { key, category, label, score: 0, maxScore, signal: "unavailable", reason };
}

export interface AnalysisInput {
  symbol: string;
  name: string;
  price: number;
  /** 일봉, 오래된 것부터 */
  candles: CandlePoint[];
  /** 투자자별 매매동향, 최신순 */
  flows: InvestorFlowDay[];
  valuation: Valuation | null;
  valuationNote: string | null;
  now?: Date;
}

export function buildAnalysis(input: AnalysisInput): Analysis {
  const now = input.now ?? new Date();
  const { price } = input;

  // 지표는 마지막 봉 종가 대신 현재가로 계산한다 (일봉 캐시가 몇 분 늦을 수 있다).
  const quoteLike = { symbol: input.symbol, price, currency: "KRW" as const, timestamp: now.toISOString() };
  const { today } = sessionBars(input.candles, quoteLike);
  const closes = input.candles.map((c) => c.close);
  if (today) closes[closes.length - 1] = price;
  else closes.push(price);

  const ma5 = last(sma(closes, 5));
  const ma20Series = sma(closes, 20);
  const ma60Series = sma(closes, 60);
  const ma20 = last(ma20Series);
  const ma60 = last(ma60Series);
  const ma120 = last(sma(closes, 120));
  const rsi14 = last(rsi(closes, 14));
  const macdSeries = macd(closes);
  const macdNow = macdSeries[macdSeries.length - 1];
  const band = bollinger(closes, 20, 2);
  const bandNow = band[band.length - 1];

  const yearCandles = input.candles.filter((c) => now.getTime() - new Date(c.time).getTime() <= 365 * 86_400_000);
  const { high: high52wRaw, low: low52wRaw } = range52w(input.candles, now.getTime());
  const high52w = high52wRaw != null ? Math.max(high52wRaw, price) : null;
  const low52w = low52wRaw != null ? Math.min(low52wRaw, price) : null;
  const yearCloses = [...yearCandles.map((c) => c.close)];
  if (today && yearCloses.length > 0) yearCloses[yearCloses.length - 1] = price;
  else yearCloses.push(price);
  const return1y = yearCandles.length > 1 ? price / yearCandles[0].close - 1 : null;
  const mdd = yearCloses.length > 1 ? maxDrawdown(yearCloses) : null;

  const factors: AnalysisFactor[] = [];

  // --- 추세 -----------------------------------------------------------------
  if (ma5 != null && ma20 != null && ma60 != null && ma120 != null) {
    const values = `5일 ${won(ma5)} · 20일 ${won(ma20)} · 60일 ${won(ma60)} · 120일 ${won(ma120)}`;
    if (ma5 > ma20 && ma20 > ma60 && ma60 > ma120) {
      factors.push(factor("ma-alignment", "trend", "이동평균 배열", 10, 10, `정배열(단기>장기)로 상승 추세가 이어지고 있습니다. ${values}`));
    } else if (ma5 < ma20 && ma20 < ma60 && ma60 < ma120) {
      factors.push(factor("ma-alignment", "trend", "이동평균 배열", 10, -10, `역배열(단기<장기)로 하락 추세입니다. ${values}`));
    } else {
      factors.push(factor("ma-alignment", "trend", "이동평균 배열", 10, 0, `이동평균선이 엇갈려 뚜렷한 추세가 없습니다. ${values}`));
    }
  } else {
    factors.push(unavailable("ma-alignment", "trend", "이동평균 배열", 10, "120거래일 이상의 데이터가 없어 계산하지 않았습니다."));
  }

  if (ma120 != null) {
    const gap = price / ma120 - 1;
    factors.push(
      gap >= 0
        ? factor("ma120", "trend", "120일선 대비", 8, 8, `현재가가 120일 이동평균(${won(ma120)})보다 ${pct(gap)} 위에 있어 장기 추세가 살아 있습니다.`)
        : factor("ma120", "trend", "120일선 대비", 8, -8, `현재가가 120일 이동평균(${won(ma120)})보다 ${pct(-gap)} 아래에 있어 장기 추세가 꺾였습니다.`)
    );
  } else {
    factors.push(unavailable("ma120", "trend", "120일선 대비", 8, "120거래일 이상의 데이터가 없습니다."));
  }

  {
    // 최근 10거래일 안에 20일선이 60일선을 뚫었는지
    let cross: "golden" | "dead" | null = null;
    let daysAgo = 0;
    for (let i = closes.length - 1; i >= Math.max(1, closes.length - 10); i--) {
      const a0 = ma20Series[i - 1];
      const b0 = ma60Series[i - 1];
      const a1 = ma20Series[i];
      const b1 = ma60Series[i];
      if (a0 == null || b0 == null || a1 == null || b1 == null) break;
      if (a0 <= b0 && a1 > b1) cross = "golden";
      if (a0 >= b0 && a1 < b1) cross = "dead";
      if (cross) {
        daysAgo = closes.length - 1 - i;
        break;
      }
    }

    if (ma60 == null) {
      factors.push(unavailable("ma-cross", "trend", "20·60일선 교차", 10, "60거래일 이상의 데이터가 없습니다."));
    } else if (cross === "golden") {
      factors.push(factor("ma-cross", "trend", "20·60일선 교차", 10, 10, `${daysAgo === 0 ? "오늘" : `${daysAgo}거래일 전`} 20일선이 60일선을 위로 뚫는 골든크로스가 나왔습니다.`));
    } else if (cross === "dead") {
      factors.push(factor("ma-cross", "trend", "20·60일선 교차", 10, -10, `${daysAgo === 0 ? "오늘" : `${daysAgo}거래일 전`} 20일선이 60일선을 아래로 뚫는 데드크로스가 나왔습니다.`));
    } else {
      factors.push(factor("ma-cross", "trend", "20·60일선 교차", 10, 0, `최근 10거래일 안에 20일선과 60일선의 교차가 없습니다 (20일선이 60일선 ${ma20 != null && ma20 >= ma60 ? "위" : "아래"}).`));
    }
  }

  // --- 모멘텀 ---------------------------------------------------------------
  if (rsi14 != null) {
    const r = rsi14.toFixed(1);
    let score = 0;
    let reason = `RSI ${r} 로 중립 구간(45~55)입니다.`;
    if (rsi14 < 30) [score, reason] = [15, `RSI ${r} 로 과매도 구간(30 미만)입니다. 단기 반등 가능성이 있습니다.`];
    else if (rsi14 < 45) [score, reason] = [5, `RSI ${r} 로 약세지만 과매도에 가까워지고 있습니다.`];
    else if (rsi14 > 70) [score, reason] = [-15, `RSI ${r} 로 과매수 구간(70 초과)입니다. 단기 조정 가능성이 있습니다.`];
    else if (rsi14 > 55) [score, reason] = [-5, `RSI ${r} 로 강세지만 과매수에 가까워지고 있습니다.`];
    factors.push(factor("rsi", "momentum", "RSI(14)", 15, score, reason));
  } else {
    factors.push(unavailable("rsi", "momentum", "RSI(14)", 15, "15거래일 이상의 데이터가 없습니다."));
  }

  if (macdNow?.histogram != null) {
    const hist = macdNow.histogram;
    let score = hist > 0 ? 8 : hist < 0 ? -8 : 0;
    let reason =
      hist > 0
        ? "MACD 가 시그널선 위에 있어 상승 탄력이 우세합니다."
        : hist < 0
          ? "MACD 가 시그널선 아래에 있어 하락 탄력이 우세합니다."
          : "MACD 와 시그널선이 겹쳐 있습니다.";

    // 최근 5거래일 안에 시그널선을 교차했으면 신호를 키운다.
    for (let i = macdSeries.length - 1; i >= Math.max(1, macdSeries.length - 5); i--) {
      const prev = macdSeries[i - 1].histogram;
      const cur = macdSeries[i].histogram;
      if (prev == null || cur == null) break;
      if (prev <= 0 && cur > 0) {
        score = 12;
        reason = `최근 MACD 가 시그널선을 위로 교차했습니다 (매수 신호).`;
        break;
      }
      if (prev >= 0 && cur < 0) {
        score = -12;
        reason = `최근 MACD 가 시그널선을 아래로 교차했습니다 (매도 신호).`;
        break;
      }
    }
    factors.push(factor("macd", "momentum", "MACD(12,26,9)", 12, score, reason));
  } else {
    factors.push(unavailable("macd", "momentum", "MACD(12,26,9)", 12, "35거래일 이상의 데이터가 없습니다."));
  }

  // --- 위치 -----------------------------------------------------------------
  if (bandNow.upper != null && bandNow.lower != null && bandNow.upper > bandNow.lower) {
    const pb = (price - bandNow.lower) / (bandNow.upper - bandNow.lower);
    const range = `하단 ${won(bandNow.lower)} ~ 상단 ${won(bandNow.upper)}`;
    let score = 0;
    let reason = `볼린저밴드 중간 영역에 있습니다 (${range}).`;
    if (pb < 0) [score, reason] = [10, `볼린저밴드 하단을 밑돌아 과매도 상태입니다 (${range}).`];
    else if (pb < 0.2) [score, reason] = [5, `볼린저밴드 하단 부근입니다 (${range}).`];
    else if (pb > 1) [score, reason] = [-10, `볼린저밴드 상단을 넘어 과열 상태입니다 (${range}).`];
    else if (pb > 0.8) [score, reason] = [-5, `볼린저밴드 상단 부근입니다 (${range}).`];
    factors.push(factor("bollinger", "position", "볼린저밴드(20,2)", 10, score, reason));
  } else {
    factors.push(unavailable("bollinger", "position", "볼린저밴드(20,2)", 10, "20거래일 이상의 데이터가 없습니다."));
  }

  if (high52w != null && low52w != null && high52w > low52w) {
    const pos = (price - low52w) / (high52w - low52w);
    const range = `최저 ${won(low52w)} ~ 최고 ${won(high52w)}`;
    let score = 0;
    let reason = `52주 범위의 ${pct(pos, 0)} 지점입니다 (${range}).`;
    if (pos <= 0.2) [score, reason] = [6, `52주 저점 부근(범위의 ${pct(pos, 0)})으로 가격 부담이 적습니다 (${range}).`];
    else if (pos >= 0.9) [score, reason] = [-4, `52주 고점 부근(범위의 ${pct(pos, 0)})이라 추격 매수에 주의가 필요합니다 (${range}).`];
    factors.push(factor("range52w", "position", "52주 범위 위치", 6, score, reason));
  } else {
    factors.push(unavailable("range52w", "position", "52주 범위 위치", 6, "1년치 가격 데이터가 없습니다."));
  }

  if (return1y != null && mdd != null) {
    factors.push({
      key: "return1y",
      category: "position",
      label: "1년 수익률·최대낙폭",
      score: 0,
      maxScore: 0,
      signal: "info",
      reason: `최근 1년 수익률 ${return1y >= 0 ? "+" : ""}${pct(return1y)}, 기간 중 최대 낙폭 ${pct(mdd)} (참고 지표, 점수 없음).`,
    });
  }

  // --- 수급 -----------------------------------------------------------------
  const recentVolumes = input.candles.slice(-20).map((c) => c.volume);
  const avgVolume = recentVolumes.length > 0 ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length : 0;

  for (const [key, label, pick] of [
    ["foreigner", "외국인 수급", (d: InvestorFlowDay) => d.foreigner],
    ["institution", "기관 수급", (d: InvestorFlowDay) => d.institution],
  ] as const) {
    if (input.flows.length === 0 || avgVolume <= 0) {
      factors.push(unavailable(key, "flow", label, 8, "투자자별 매매동향 데이터가 없습니다."));
      continue;
    }
    const net = input.flows.reduce((s, d) => s + pick(d), 0);
    const days = net / avgVolume;
    const who = label.replace(" 수급", "");
    const base = `최근 ${input.flows.length}거래일 ${who} 순${net >= 0 ? "매수" : "매도"} ${shares(Math.abs(net))} (하루 평균 거래량의 ${Math.abs(days).toFixed(2)}배)`;
    let score = 0;
    if (days > 0.5) score = 8;
    else if (days > 0) score = 4;
    else if (days < -0.5) score = -8;
    else if (days < 0) score = -4;
    factors.push(factor(key, "flow", label, 8, score, `${base}.`));
  }

  {
    const rates = input.flows.map((d) => d.shortSellingRate).filter((v): v is number => v != null);
    if (rates.length === 0) {
      factors.push(unavailable("short", "flow", "공매도 비중", 6, "공매도 데이터가 없습니다."));
    } else {
      const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
      let score = 0;
      let reason = `최근 ${rates.length}거래일 평균 공매도 비중 ${pct(avg, 2)} 로 보통 수준입니다.`;
      if (avg > 0.1) [score, reason] = [-6, `최근 ${rates.length}거래일 평균 공매도 비중이 ${pct(avg, 2)} 로 높아 하락 압력이 큽니다.`];
      else if (avg > 0.05) [score, reason] = [-3, `최근 ${rates.length}거래일 평균 공매도 비중이 ${pct(avg, 2)} 로 다소 높습니다.`];
      else if (avg < 0.02) [score, reason] = [2, `최근 ${rates.length}거래일 평균 공매도 비중이 ${pct(avg, 2)} 로 낮습니다.`];
      factors.push(factor("short", "flow", "공매도 비중", 6, score, reason));
    }
  }

  // --- 가치 -----------------------------------------------------------------
  const v = input.valuation;
  const noValuation = input.valuationNote ?? "재무 지표가 없습니다.";

  if (v?.eps != null && v.eps <= 0) {
    factors.push(factor("per", "valuation", "PER", 8, -8, `주당순이익이 ${won(v.eps)} 로 적자라 PER 을 계산할 수 없습니다 (${v.basis}).`));
  } else if (v?.per != null) {
    const per = v.per.toFixed(1);
    let score = 0;
    let reason = `PER ${per}배로 보통 수준입니다 (EPS ${won(v.eps ?? 0)}, ${v.basis}).`;
    if (v.per < 8) [score, reason] = [8, `PER ${per}배로 이익 대비 주가가 낮습니다 (EPS ${won(v.eps ?? 0)}, ${v.basis}).`];
    else if (v.per < 12) [score, reason] = [5, `PER ${per}배로 다소 저평가 구간입니다 (EPS ${won(v.eps ?? 0)}, ${v.basis}).`];
    else if (v.per >= 35) [score, reason] = [-8, `PER ${per}배로 이익 대비 주가가 높습니다 (EPS ${won(v.eps ?? 0)}, ${v.basis}).`];
    else if (v.per >= 20) [score, reason] = [-4, `PER ${per}배로 다소 고평가 구간입니다 (EPS ${won(v.eps ?? 0)}, ${v.basis}).`];
    factors.push(factor("per", "valuation", "PER", 8, score, reason));
  } else {
    factors.push(unavailable("per", "valuation", "PER", 8, noValuation));
  }

  if (v?.pbr != null) {
    const pbr = v.pbr.toFixed(2);
    let score = 0;
    let reason = `PBR ${pbr}배로 보통 수준입니다 (BPS ${won(v.bps ?? 0)}).`;
    if (v.pbr < 0.7) [score, reason] = [6, `PBR ${pbr}배로 순자산보다 크게 싸게 거래됩니다 (BPS ${won(v.bps ?? 0)}).`];
    else if (v.pbr < 1) [score, reason] = [4, `PBR ${pbr}배로 순자산 가치보다 낮습니다 (BPS ${won(v.bps ?? 0)}).`];
    else if (v.pbr >= 4) [score, reason] = [-6, `PBR ${pbr}배로 순자산 대비 주가가 높습니다 (BPS ${won(v.bps ?? 0)}).`];
    else if (v.pbr >= 2) [score, reason] = [-3, `PBR ${pbr}배로 다소 높습니다 (BPS ${won(v.bps ?? 0)}).`];
    factors.push(factor("pbr", "valuation", "PBR", 6, score, reason));
  } else {
    factors.push(unavailable("pbr", "valuation", "PBR", 6, noValuation));
  }

  if (v?.roe != null) {
    const roe = pct(v.roe);
    let score = 0;
    let reason = `ROE ${roe} 로 수익성이 보통입니다.`;
    if (v.roe >= 0.15) [score, reason] = [6, `ROE ${roe} 로 자본 대비 수익성이 높습니다.`];
    else if (v.roe >= 0.08) [score, reason] = [3, `ROE ${roe} 로 수익성이 양호합니다.`];
    else if (v.roe < 0) [score, reason] = [-6, `ROE ${roe} 로 순손실을 냈습니다.`];
    factors.push(factor("roe", "valuation", "ROE", 6, score, reason));
  } else {
    factors.push(unavailable("roe", "valuation", "ROE", 6, noValuation));
  }

  // --- 종합 -----------------------------------------------------------------
  const raw = factors.reduce((s, f) => s + f.score, 0);
  const score = Math.max(-100, Math.min(100, raw));
  const rating = ratingOf(score);

  const strongest = (sign: 1 | -1) =>
    factors
      .filter((f) => Math.sign(f.score) === sign)
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 2)
      .map((f) => f.label);
  const pros = strongest(1);
  const cons = strongest(-1);
  const summary = [
    `종합 점수 ${score > 0 ? "+" : ""}${score}점으로 '${RATING_LABEL[rating]}' 신호입니다.`,
    pros.length > 0 ? `긍정 요인: ${pros.join(", ")}.` : "",
    cons.length > 0 ? `부정 요인: ${cons.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    symbol: input.symbol,
    name: input.name,
    asOf: now.toISOString(),
    price,
    score,
    rating,
    ratingLabel: RATING_LABEL[rating],
    summary,
    factors,
    indicators: {
      ma5,
      ma20,
      ma60,
      ma120,
      rsi14,
      macd: macdNow?.macd ?? null,
      macdSignal: macdNow?.signal ?? null,
      bollingerUpper: bandNow.upper,
      bollingerLower: bandNow.lower,
      high52w,
      low52w,
      return1y,
      maxDrawdown1y: mdd,
    },
    disclaimer: DISCLAIMER,
  };
}

export async function getAnalysis(symbol: string): Promise<Analysis> {
  const stock = await marketData.getStock(symbol);
  const quote = await marketData.getQuote(stock.symbol);

  const [candles, flows, valuation] = await Promise.all([
    marketData.getDailyCandles(stock.symbol),
    // 수급은 국내 종목만 있다. 없어도 나머지 항목으로 추천한다.
    stock.currency === "KRW" ? marketData.getInvestorFlows(stock.symbol).catch(() => []) : Promise.resolve([]),
    getValuation(stock, quote.price),
  ]);

  return buildAnalysis({
    symbol: stock.symbol,
    name: stock.name,
    price: quote.price,
    candles,
    flows,
    valuation: valuation.valuation,
    valuationNote: valuation.note,
    now: quote.timestamp ? new Date(quote.timestamp) : new Date(),
  });
}

