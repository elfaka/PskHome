import { describe, it, expect } from "vitest";

import { FACTOR_GUIDE } from "./analysis.guide.js";
import { buildAnalysis, RATING_SCALE, ratingOf, type AnalysisInput } from "./analysis.service.js";
import type { CandlePoint, FinancialYear, InvestorFlowDay, Valuation } from "./stockSim.types.js";

const NOW = new Date("2026-10-30T06:30:00.000Z");

/** 평일 일봉을 closes 순서대로 만든다 (마지막이 NOW 와 같은 날). */
function candlesFrom(closes: number[]): CandlePoint[] {
  const times: string[] = [];
  const d = new Date(Date.UTC(2026, 9, 29, 15));
  while (times.length < closes.length) {
    const dow = new Date(d.getTime() + 9 * 3_600_000).getUTCDay();
    if (dow !== 0 && dow !== 6) times.unshift(d.toISOString());
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return closes.map((close, i) => ({ time: times[i], open: close, high: close, low: close, close, volume: 1000 }));
}

function flows(foreigner: number, institution: number, shortRate: number | null = 0.03): InvestorFlowDay[] {
  return Array.from({ length: 20 }, (_, i) => ({
    date: `2026-10-${String(30 - i).padStart(2, "0")}`,
    individual: null,
    foreigner,
    institution,
    otherCorporation: null,
    foreignerHoldingRate: 0.5,
    shortSellingRate: shortRate,
  }));
}

const valuation = (overrides: Partial<Valuation> = {}): Valuation => ({
  basis: "2025 사업보고서 (연결)",
  bsnsYear: 2025,
  consolidated: true,
  revenue: 1000,
  operatingIncome: 100,
  netIncome: 80,
  totalEquity: 500,
  totalLiabilities: 200,
  eps: 1000,
  bps: 20_000,
  per: 15,
  pbr: 1.5,
  roe: 0.1,
  operatingMargin: 0.1,
  debtRatio: 0.4,
  dividendPerShare: 100,
  dividendYield: 0.01,
  history: [],
  ...overrides,
});

/** 사업연도 한 줄. 증감률은 직접 넣는다 (valuation.ts 의 계산과 같은 값이라고 가정) */
function year(y: number, revenue: number, operatingIncome: number, growth: Partial<FinancialYear> = {}): FinancialYear {
  return {
    year: y,
    revenue,
    operatingIncome,
    netIncome: operatingIncome,
    totalAssets: 1000,
    totalLiabilities: 200,
    totalEquity: 500,
    eps: null,
    dividendPerShare: null,
    operatingMargin: operatingIncome / revenue,
    netMargin: operatingIncome / revenue,
    roe: 0.1,
    debtRatio: 0.4,
    revenueGrowth: null,
    operatingIncomeGrowth: null,
    netIncomeGrowth: null,
    ...growth,
  };
}

function analyze(closes: number[], extra: Partial<AnalysisInput> = {}) {
  return buildAnalysis({
    symbol: "005930",
    name: "삼성전자",
    price: closes[closes.length - 1],
    candles: candlesFrom(closes),
    flows: [],
    valuation: null,
    valuationNote: null,
    now: NOW,
    ...extra,
  });
}

const factorOf = (a: ReturnType<typeof analyze>, key: string) => a.factors.find((f) => f.key === key)!;

describe("ratingOf", () => {
  it("maps scores to five levels", () => {
    expect(ratingOf(45)).toBe("STRONG_BUY");
    expect(ratingOf(44)).toBe("BUY");
    expect(ratingOf(18)).toBe("BUY");
    expect(ratingOf(17)).toBe("NEUTRAL");
    expect(ratingOf(-17)).toBe("NEUTRAL");
    expect(ratingOf(-18)).toBe("SELL");
    expect(ratingOf(-44)).toBe("SELL");
    expect(ratingOf(-45)).toBe("STRONG_SELL");
  });
});

describe("RATING_SCALE", () => {
  it("matches ratingOf at every band edge", () => {
    for (const band of RATING_SCALE) {
      expect(ratingOf(band.min)).toBe(band.rating);
    }
    // 각 구간 최저점 바로 아래는 한 단계 낮은 등급
    for (const [i, band] of RATING_SCALE.slice(0, -1).entries()) {
      expect(ratingOf(band.min - 1)).toBe(RATING_SCALE[i + 1].rating);
    }
  });
});

describe("factor explanations", () => {
  /** 오르다 내리는 흐름 — 여러 항목이 서로 다른 점수를 받도록 */
  const closes = [...Array.from({ length: 200 }, (_, i) => 1000 + i * 3), ...Array.from({ length: 60 }, (_, i) => 1600 - i * 6)];
  const cases: [string, Partial<AnalysisInput>][] = [
    ["no flows or valuation", {}],
    ["buying with cheap valuation", { flows: flows(800, 30, 0.01), valuation: valuation({ per: 6, pbr: 0.6, roe: 0.2 }) }],
    ["selling with expensive valuation", { flows: flows(-800, -30, 0.12), valuation: valuation({ per: 40, pbr: 5, roe: -0.1 }) }],
    [
      "growing, profitable company",
      {
        valuation: valuation({
          operatingMargin: 0.25,
          debtRatio: 0.3,
          history: [year(2024, 100, 10), year(2025, 130, 15, { revenueGrowth: 0.3, operatingIncomeGrowth: 0.5 })],
        }),
      },
    ],
    [
      "value trap",
      {
        valuation: valuation({
          per: 6,
          pbr: 0.6,
          history: [year(2024, 100, 20), year(2025, 90, 10, { revenueGrowth: -0.1, operatingIncomeGrowth: -0.5 })],
        }),
      },
    ],
    [
      "turnaround",
      { valuation: valuation({ history: [year(2024, 100, -5), year(2025, 110, 10, { operatingIncomeGrowth: 3 })] }) },
    ],
    ["operating loss", { valuation: valuation({ history: [year(2024, 100, 5), year(2025, 90, -3)] }) }],
  ];

  it.each(cases)("marks exactly the score row as matched (%s)", (_, extra) => {
    const a = analyze(closes, extra);

    for (const f of a.factors) {
      expect(f.description, f.key).not.toBe("");
      const matched = f.rules.filter((r) => r.matched);
      if (f.signal === "unavailable" || f.signal === "info") {
        expect(matched, f.key).toHaveLength(0);
      } else {
        expect(matched, f.key).toHaveLength(1);
        expect(matched[0].points, f.key).toBe(f.score);
        expect(f.values.length, f.key).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every rule table within the factor max score", () => {
    const a = analyze(closes, { flows: flows(100, 100), valuation: valuation() });
    for (const f of a.factors) {
      for (const r of f.rules) expect(Math.abs(r.points), f.key).toBeLessThanOrEqual(f.maxScore);
      expect(FACTOR_GUIDE[f.key], f.key).toBeDefined();
    }
  });

  it("tells a loss-making PER apart from a very high PER (both -8)", () => {
    const loss = factorOf(analyze(closes, { valuation: valuation({ eps: -500, per: null }) }), "per");
    expect(loss.rules.find((r) => r.matched)?.condition).toContain("적자");

    const high = factorOf(analyze(closes, { valuation: valuation({ per: 40 }) }), "per");
    expect(high.rules.find((r) => r.matched)?.condition).toBe("35배 이상");
  });

  it("lists the values the score was computed from", () => {
    const a = analyze(closes, { flows: flows(800, 30, 0.01), valuation: valuation({ per: 6 }) });

    expect(factorOf(a, "rsi").values.map((v) => v.label)).toEqual(["RSI(14)"]);
    expect(factorOf(a, "bollinger").values.map((v) => v.label)).toContain("%B");
    expect(factorOf(a, "per").values).toContainEqual({ label: "PER", value: "6.0배" });
    expect(factorOf(a, "foreigner").values[0].value).toBe("+16,000주");
    expect(a.ratingScale).toBe(RATING_SCALE);
  });

  it("shows no values for factors without data", () => {
    const a = analyze(closes);
    expect(factorOf(a, "per").values).toEqual([]);
    expect(factorOf(a, "per").rules.length).toBeGreaterThan(0);
  });
});

describe("quant factors", () => {
  const rising = Array.from({ length: 300 }, (_, i) => 1000 + i * 5);

  it("scores revenue and operating income growth from the latest annual report", () => {
    const a = analyze(rising, {
      valuation: valuation({
        history: [year(2024, 100, 10), year(2025, 130, 15, { revenueGrowth: 0.3, operatingIncomeGrowth: 0.5 })],
      }),
    });

    expect(factorOf(a, "revenue-growth")).toMatchObject({ category: "growth", score: 6 });
    expect(factorOf(a, "op-growth")).toMatchObject({ category: "growth", score: 8 });
    expect(factorOf(a, "op-growth").rules.find((r) => r.matched)?.condition).toBe("+30% 이상");
    expect(factorOf(a, "revenue-growth").values).toContainEqual({ label: "전년 대비", value: "+30.0%" });
  });

  it("tells a turnaround and an operating loss apart from ordinary growth", () => {
    const turnaround = factorOf(
      analyze(rising, { valuation: valuation({ history: [year(2024, 100, -5), year(2025, 110, 10, { operatingIncomeGrowth: 3 })] }) }),
      "op-growth"
    );
    expect(turnaround.score).toBe(8);
    expect(turnaround.rules.find((r) => r.matched)?.condition).toContain("흑자 전환");

    const loss = factorOf(analyze(rising, { valuation: valuation({ history: [year(2024, 100, 5), year(2025, 90, -3)] }) }), "op-growth");
    expect(loss.score).toBe(-8);
    expect(loss.rules.find((r) => r.matched)?.condition).toBe("올해 영업 적자");
  });

  it("skips growth when the latest year is not the report year or has no prior year", () => {
    const stale = analyze(rising, { valuation: valuation({ bsnsYear: 2025, history: [year(2023, 100, 10), year(2024, 120, 12)] }) });
    expect(factorOf(stale, "revenue-growth").signal).toBe("unavailable");

    const single = analyze(rising, { valuation: valuation({ history: [year(2025, 100, 10)] }) });
    expect(factorOf(single, "op-growth").signal).toBe("unavailable");
    expect(factorOf(single, "op-growth").reason).toContain("전년과 비교할");
  });

  it("drops the cheap-valuation bonus when operating income fell more than 10% (value trap)", () => {
    const trap = valuation({
      per: 6,
      pbr: 0.6,
      history: [year(2024, 100, 20), year(2025, 90, 10, { revenueGrowth: -0.1, operatingIncomeGrowth: -0.5 })],
    });
    const a = analyze(rising, { valuation: trap });

    for (const key of ["per", "pbr"]) {
      const f = factorOf(a, key);
      expect(f.score, key).toBe(0);
      expect(f.reason, key).toContain("가치 함정");
      expect(f.rules.find((r) => r.matched)?.condition, key).toContain("가치 함정 보정");
      expect(f.values, key).toContainEqual({ label: "영업이익 전년 대비", value: "-50.0%" });
    }

    // 감점은 그대로 둔다
    const expensive = analyze(rising, { valuation: { ...trap, per: 40, pbr: 5 } });
    expect(factorOf(expensive, "per").score).toBe(-8);
    expect(factorOf(expensive, "pbr").score).toBe(-6);

    // 이익 감소가 10% 이내면 보정하지 않는다
    const mild = analyze(rising, {
      valuation: valuation({ per: 6, history: [year(2024, 100, 20), year(2025, 100, 19, { operatingIncomeGrowth: -0.05 })] }),
    });
    expect(factorOf(mild, "per").score).toBe(8);
  });

  it("scores 12-1 momentum from a year ago to a month ago", () => {
    const a = analyze(rising);
    const m = factorOf(a, "momentum12");

    // 252거래일 전 1000+47*5=1235 → 21거래일 전 1000+278*5=2390 : +93.5%
    expect(m).toMatchObject({ category: "momentum", score: 8 });
    expect(m.values).toContainEqual({ label: "12-1 수익률", value: "+93.5%" });

    const short = analyze(rising.slice(0, 250));
    expect(factorOf(short, "momentum12").signal).toBe("unavailable");
  });

  it("scores operating margin and debt ratio as quality, together with ROE", () => {
    const a = analyze(rising, { valuation: valuation({ operatingMargin: 0.25, debtRatio: 2.5 }) });

    expect(factorOf(a, "op-margin")).toMatchObject({ category: "quality", score: 4 });
    expect(factorOf(a, "debt-ratio")).toMatchObject({ category: "quality", score: -3 });
    expect(factorOf(a, "roe").category).toBe("quality");

    const negativeEquity = analyze(rising, { valuation: valuation({ debtRatio: null }) });
    expect(factorOf(negativeEquity, "debt-ratio").reason).toContain("자본총계가 0 이하");
  });
});

describe("buildAnalysis", () => {
  it("reads a steady uptrend as bullish trend but overbought momentum", () => {
    const a = analyze(Array.from({ length: 250 }, (_, i) => 1000 + i * 10));

    expect(factorOf(a, "ma-alignment")).toMatchObject({ score: 10, signal: "positive" });
    expect(factorOf(a, "ma120").score).toBe(8);
    expect(factorOf(a, "rsi")).toMatchObject({ score: -15 });
    expect(factorOf(a, "rsi").reason).toContain("과매수");
    // 52주 고가 근처는 강세로 본다 (52주 고가 모멘텀)
    expect(factorOf(a, "range52w").score).toBe(6);
  });

  it("reads a steady downtrend as bearish trend but oversold momentum", () => {
    const a = analyze(Array.from({ length: 250 }, (_, i) => 5000 - i * 10));

    expect(factorOf(a, "ma-alignment").score).toBe(-10);
    expect(factorOf(a, "ma120").score).toBe(-8);
    expect(factorOf(a, "rsi").score).toBe(15);
    expect(factorOf(a, "range52w").score).toBe(-4);
  });

  it("detects a recent golden cross of the 20 and 60 day averages", () => {
    // 오래 하락하다 최근 급반등 → 20일선이 60일선을 막 뚫는다
    const closes = [...Array.from({ length: 200 }, (_, i) => 3000 - i * 5), ...Array.from({ length: 40 }, (_, i) => 2000 + i * 40)];
    let found = false;
    // 교차 시점이 10일 창 안에 들어오는 지점을 찾는다
    for (let cut = 215; cut <= 240 && !found; cut++) {
      const f = factorOf(analyze(closes.slice(0, cut)), "ma-cross");
      if (f.score === 10) {
        expect(f.reason).toContain("골든크로스");
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it("marks factors without data as unavailable with a reason", () => {
    const a = analyze(Array.from({ length: 30 }, (_, i) => 100 + (i % 3)));

    for (const key of ["ma-alignment", "ma120", "foreigner", "institution", "short", "per", "pbr", "roe"]) {
      const f = factorOf(a, key);
      expect(f.signal).toBe("unavailable");
      expect(f.score).toBe(0);
      expect(f.reason).toBeTruthy();
    }
  });

  it("uses the valuation note as the reason when financials are missing", () => {
    const a = analyze(Array.from({ length: 30 }, () => 100), { valuationNote: "DART 공시 대상이 아닌 종목입니다" });

    expect(factorOf(a, "per").reason).toBe("DART 공시 대상이 아닌 종목입니다");
  });

  it("scores investor flows relative to average volume", () => {
    const closes = Array.from({ length: 60 }, () => 100);

    const buying = analyze(closes, { flows: flows(100, -10) }); // 외국인 20일 합 2000 = 평균 거래량의 2배
    expect(factorOf(buying, "foreigner").score).toBe(8);
    expect(factorOf(buying, "institution").score).toBe(-4);
    expect(factorOf(buying, "foreigner").reason).toContain("순매수 2,000주");

    const selling = analyze(closes, { flows: flows(-100, -100, 0.12) });
    expect(factorOf(selling, "foreigner").score).toBe(-8);
    expect(factorOf(selling, "short").score).toBe(-6);
  });

  it("scores valuation from PER, PBR and ROE", () => {
    const closes = Array.from({ length: 60 }, () => 100);

    const cheap = analyze(closes, { valuation: valuation({ per: 6, pbr: 0.6, roe: 0.18 }) });
    expect(factorOf(cheap, "per").score).toBe(8);
    expect(factorOf(cheap, "pbr").score).toBe(6);
    expect(factorOf(cheap, "roe").score).toBe(6);

    const loss = analyze(closes, { valuation: valuation({ eps: -500, per: null, roe: -0.05 }) });
    expect(factorOf(loss, "per").score).toBe(-8);
    expect(factorOf(loss, "per").reason).toContain("적자");
    expect(factorOf(loss, "roe").score).toBe(-6);
  });

  it("sums factor scores into the rating and explains it", () => {
    const a = analyze(Array.from({ length: 250 }, (_, i) => 5000 - i * 10), {
      flows: flows(100, 100, 0.01),
      valuation: valuation({ per: 6, pbr: 0.6, roe: 0.18 }),
    });

    expect(a.score).toBe(a.factors.reduce((s, f) => s + f.score, 0));
    expect(a.rating).toBe(ratingOf(a.score));
    expect(a.summary).toContain(a.ratingLabel);
    expect(a.disclaimer).toContain("투자 권유가 아닙니다");
  });

  it("uses the live price instead of a stale last close", () => {
    const closes = Array.from({ length: 30 }, () => 100);
    const a = buildAnalysis({
      symbol: "005930",
      name: "삼성전자",
      price: 200,
      candles: candlesFrom(closes),
      flows: [],
      valuation: null,
      valuationNote: null,
      now: NOW,
    });

    expect(a.price).toBe(200);
    expect(a.indicators.ma5).toBe((100 * 4 + 200) / 5);
  });
});
