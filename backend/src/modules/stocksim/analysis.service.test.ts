import { describe, it, expect } from "vitest";

import { buildAnalysis, ratingOf, type AnalysisInput } from "./analysis.service.js";
import type { CandlePoint, InvestorFlowDay, Valuation } from "./stockSim.types.js";

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
  ...overrides,
});

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
    expect(ratingOf(35)).toBe("STRONG_BUY");
    expect(ratingOf(12)).toBe("BUY");
    expect(ratingOf(11)).toBe("NEUTRAL");
    expect(ratingOf(-11)).toBe("NEUTRAL");
    expect(ratingOf(-12)).toBe("SELL");
    expect(ratingOf(-35)).toBe("STRONG_SELL");
  });
});

describe("buildAnalysis", () => {
  it("reads a steady uptrend as bullish trend but overbought momentum", () => {
    const a = analyze(Array.from({ length: 250 }, (_, i) => 1000 + i * 10));

    expect(factorOf(a, "ma-alignment")).toMatchObject({ score: 10, signal: "positive" });
    expect(factorOf(a, "ma120").score).toBe(8);
    expect(factorOf(a, "rsi")).toMatchObject({ score: -15 });
    expect(factorOf(a, "rsi").reason).toContain("과매수");
    expect(factorOf(a, "range52w").score).toBe(-4);
  });

  it("reads a steady downtrend as bearish trend but oversold momentum", () => {
    const a = analyze(Array.from({ length: 250 }, (_, i) => 5000 - i * 10));

    expect(factorOf(a, "ma-alignment").score).toBe(-10);
    expect(factorOf(a, "ma120").score).toBe(-8);
    expect(factorOf(a, "rsi").score).toBe(15);
    expect(factorOf(a, "range52w").score).toBe(6);
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
