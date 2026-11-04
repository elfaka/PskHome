import { http, HttpResponse } from "msw";

const mockPost = {
  id: 1,
  title: "테스트 제목",
  site: "BOJ",
  problemNumber: "1001",
  link: "https://boj.kr/1001",
  level: "Silver",
  language: "Java",
  solution: "A + B",
  contentMd: "# 두 수의 합",
  isSolved: true,
  createdAt: "2024-01-01T00:00:00.000Z",
};

const mockPage = {
  content: [mockPost],
  totalElements: 1,
  totalPages: 1,
  number: 0,
  size: 10,
  first: true,
  last: true,
  empty: false,
};

export const mockPortfolio = {
  initialCash: 10_000_000,
  cash: 9_300_000,
  holdings: [
    {
      symbol: "005930",
      name: "삼성전자",
      quantity: 10,
      avgPrice: 70_000,
      costBasis: 700_000,
      currentPrice: 77_000,
      marketValue: 770_000,
      unrealizedPnl: 70_000,
      returnRate: 0.1,
    },
  ],
  totalMarketValue: 770_000,
  totalAssets: 10_070_000,
  totalPnl: 70_000,
  totalReturnRate: 0.007,
  realizedPnl: 0,
  trades: [
    {
      id: "t-1",
      symbol: "005930",
      name: "삼성전자",
      side: "BUY",
      quantity: 10,
      price: 70_000,
      amount: 700_000,
      realizedPnl: null,
      executedAt: "2026-10-30T01:00:00.000Z",
    },
  ],
  createdAt: "2026-10-30T00:00:00.000Z",
};

export const handlers = [
  http.get("/api/posts", () => HttpResponse.json(mockPage)),

  http.get("/api/posts/:id", ({ params }) => {
    const id = Number(params.id);
    return HttpResponse.json({ ...mockPost, id });
  }),

  http.post("/api/posts", () => HttpResponse.json(1)),

  http.put("/api/posts/:id", ({ params }) =>
    HttpResponse.json(Number(params.id))
  ),

  http.delete("/api/posts/:id", () => new HttpResponse(null, { status: 200 })),

  http.post("/api/json/format", () =>
    HttpResponse.json({
      ok: true,
      mode: "prettify",
      formatted: '{\n  "a": 1\n}',
      stats: { inputLength: 7, outputLength: 12 },
    })
  ),

  http.get("/api/stocksim/search", ({ request }) => {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const all = [
      { symbol: "005930", name: "삼성전자", market: "KOSPI", securityType: "STOCK" },
      { symbol: "000660", name: "SK하이닉스", market: "KOSPI", securityType: "STOCK" },
    ];
    return HttpResponse.json(all.filter((s) => s.name.includes(q) || s.symbol.startsWith(q)));
  }),

  http.get("/api/stocksim/quotes", ({ request }) => {
    const symbols = (new URL(request.url).searchParams.get("symbols") ?? "").split(",");
    return HttpResponse.json(
      symbols.map((symbol) => ({
        symbol,
        price: 77_000,
        currency: "KRW",
        timestamp: "2026-10-30T05:00:00.000Z",
        ...(new URL(request.url).searchParams.get("change") === "1"
          ? { prevClose: 76_000, change: 1_000, changeRate: 1_000 / 76_000 }
          : {}),
      }))
    );
  }),

  http.get("/api/stocksim/chart/:symbol", ({ request, params }) => {
    const timeframe = new URL(request.url).searchParams.get("timeframe") ?? "1d";
    const count = 60;
    const candles = Array.from({ length: count }, (_, i) => ({
      time: new Date(Date.UTC(2026, 7, 31 + i)).toISOString(),
      open: 70_000,
      high: 78_000,
      low: 69_000,
      close: 70_000 + i * 100,
      volume: 1000,
    }));
    const nulls = <T,>(v: T) => candles.map((_, i) => (i < 19 ? null : v));
    return HttpResponse.json({
      symbol: params.symbol,
      timeframe,
      candles,
      indicators: {
        ma5: nulls(72_000),
        ma20: nulls(71_000),
        ma60: candles.map(() => null),
        ma120: candles.map(() => null),
        bollinger: nulls({ middle: 71_000, upper: 74_000, lower: 68_000 }).map((b) => b ?? { middle: null, upper: null, lower: null }),
        rsi: nulls(55),
        macd: candles.map(() => ({ macd: null, signal: null, histogram: null })),
      },
    });
  }),

  http.get("/api/stocksim/market", () =>
    HttpResponse.json({
      indices: [
        {
          symbol: "KOSPI",
          name: "코스피",
          value: 2812.45,
          timestamp: "2026-10-30T06:30:00.000Z",
          prevClose: 2798.1,
          change: 14.35,
          changeRate: 14.35 / 2798.1,
          intraday: [
            { time: "2026-10-30T00:00:00.000Z", value: 2800 },
            { time: "2026-10-30T00:05:00.000Z", value: 2805 },
            { time: "2026-10-30T00:10:00.000Z", value: 2812.45 },
          ],
        },
        {
          symbol: "KOSDAQ",
          name: "코스닥",
          value: 845.32,
          timestamp: "2026-10-30T06:30:00.000Z",
          prevClose: 850,
          change: -4.68,
          changeRate: -4.68 / 850,
          intraday: [],
        },
      ],
      fearGreed: {
        score: 62,
        level: "GREED",
        label: "탐욕",
        asOf: "2026-10-30",
        factors: [
          { key: "momentum", label: "모멘텀", score: 70, value: "125일선 대비 +4.0%", reason: "코스피가 125일 이동평균 위에 있어 상승 추세입니다." },
          { key: "rsi", label: "과열도", score: 58, value: "RSI(14) 58.0", reason: "과열·과매도 어느 쪽도 아닙니다." },
          { key: "volatility", label: "변동성", score: 55, value: "20일 14.0% (1년 평균의 0.95배)", reason: "변동성이 평소 수준입니다." },
          { key: "riskAppetite", label: "위험 선호", score: 45, value: "20일 코스닥 +1.0% · 코스피 +1.5%", reason: "코스닥과 코스피의 흐름이 비슷합니다." },
          { key: "safeHaven", label: "안전자산 선호", score: 60, value: "코스피 20일 +1.5% · 국고채 10년 +0.05%p", reason: "주식과 안전자산 선호가 균형을 이룹니다." },
          { key: "flow", label: "수급", score: null, value: "-", reason: "시장 투자자별 매매대금을 받지 못했습니다." },
        ],
        history: [
          { label: "1주 전", score: 48 },
          { label: "1개월 전", score: 30 },
        ],
        disclaimer: "코스피·코스닥 지수, 국고채 금리, 투자자별 매매대금으로 직접 계산한 참고 지표이며 공식 공포·탐욕 지수가 아닙니다.",
      },
      fearGreedNote: null,
      vix: {
        symbol: "VIX",
        name: "VIX",
        value: 21.15,
        timestamp: "2026-11-02T21:15:01.000Z",
        prevClose: 19.42,
        change: 1.73,
        changeRate: 0.081797,
        open: 19.05,
        high: 21.77,
        low: 18.03,
        level: "ELEVATED",
        levelLabel: "불안",
        recent: [
          { time: "2026-10-29T00:00:00+09:00", value: 18.5 },
          { time: "2026-10-30T00:00:00+09:00", value: 19.42 },
          { time: "2026-11-02T00:00:00+09:00", value: 21.15 },
        ],
        source: "Cboe · 15분 지연",
      },
      vixNote: null,
    })
  ),

  http.get("/api/stocksim/market/:symbol/chart", ({ request, params }) => {
    const timeframe = new URL(request.url).searchParams.get("timeframe") ?? "1d";
    const candles = Array.from({ length: 30 }, (_, i) => ({
      time: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
      open: 2_700,
      high: 2_850,
      low: 2_690,
      close: 2_700 + i * 3.5,
      // VIX 는 거래량이 없다
      volume: params.symbol === "VIX" ? 0 : 500_000_000,
    }));
    const empty = candles.map(() => null);
    return HttpResponse.json({
      symbol: params.symbol,
      timeframe,
      candles,
      indicators: {
        ma5: empty,
        ma20: empty,
        ma60: empty,
        ma120: empty,
        bollinger: candles.map(() => ({ middle: null, upper: null, lower: null })),
        rsi: empty,
        macd: candles.map(() => ({ macd: null, signal: null, histogram: null })),
      },
    });
  }),

  http.get("/api/stocksim/market/:symbol/investors", () =>
    HttpResponse.json([
      { date: "2026-10-30", individual: -320e9, foreigner: 250e9, institution: 90e9, otherCorporation: -20e9, tradingValue: 11e12 },
      { date: "2026-10-29", individual: 150e9, foreigner: -100e9, institution: -60e9, otherCorporation: 10e9, tradingValue: 10e12 },
    ])
  ),

  http.get("/api/stocksim/stocks/:symbol/overview", ({ params }) =>
    HttpResponse.json({
      symbol: params.symbol,
      name: params.symbol === "000660" ? "SK하이닉스" : "삼성전자",
      market: "KOSPI",
      securityType: "STOCK",
      currency: "KRW",
      tradingSuspended: false,
      price: 77_000,
      priceTime: "2026-10-30T05:00:00.000Z",
      prevClose: 76_000,
      change: 1_000,
      changeRate: 1_000 / 76_000,
      open: 76_500,
      high: 77_500,
      low: 75_800,
      volume: 12_345_678,
      high52w: 90_000,
      low52w: 50_000,
      upperLimit: 98_800,
      lowerLimit: 53_200,
      sharesOutstanding: 5_919_637_922,
      marketCap: 77_000 * 5_919_637_922,
      valuation: {
        basis: "2025 사업보고서 (연결)",
        bsnsYear: 2025,
        consolidated: true,
        revenue: 333_605_938_000_000,
        operatingIncome: 43_601_051_000_000,
        netIncome: 45_206_805_000_000,
        totalEquity: 436_320_337_000_000,
        totalLiabilities: 130_621_773_000_000,
        eps: 6605,
        bps: 73_707,
        per: 11.66,
        pbr: 1.04,
        roe: 0.1036,
        operatingMargin: 0.1307,
        debtRatio: 0.2994,
        dividendPerShare: 1668,
        dividendYield: 0.0217,
        history: [
          {
            year: 2023,
            revenue: 258_935_494_000_000,
            operatingIncome: 6_566_976_000_000,
            netIncome: 15_487_100_000_000,
            totalAssets: 455_905_980_000_000,
            totalLiabilities: 92_228_115_000_000,
            totalEquity: 363_677_865_000_000,
            eps: 2131,
            dividendPerShare: 1444,
            operatingMargin: 0.0254,
            netMargin: 0.0598,
            roe: 0.0426,
            debtRatio: 0.2536,
            revenueGrowth: null,
            operatingIncomeGrowth: null,
            netIncomeGrowth: null,
          },
          {
            year: 2024,
            revenue: 300_870_903_000_000,
            operatingIncome: 32_725_961_000_000,
            netIncome: 34_451_351_000_000,
            totalAssets: 514_531_948_000_000,
            totalLiabilities: 112_339_878_000_000,
            totalEquity: 402_192_070_000_000,
            eps: 4950,
            dividendPerShare: 1446,
            operatingMargin: 0.1088,
            netMargin: 0.1145,
            roe: 0.0857,
            debtRatio: 0.2793,
            revenueGrowth: 0.162,
            operatingIncomeGrowth: 3.9834,
            netIncomeGrowth: 1.2245,
          },
          {
            year: 2025,
            revenue: 333_605_938_000_000,
            operatingIncome: 43_601_051_000_000,
            netIncome: 45_206_805_000_000,
            totalAssets: 566_942_110_000_000,
            totalLiabilities: 130_621_773_000_000,
            totalEquity: 436_320_337_000_000,
            eps: 6605,
            dividendPerShare: 1668,
            operatingMargin: 0.1307,
            netMargin: 0.1355,
            roe: 0.1036,
            debtRatio: 0.2994,
            revenueGrowth: 0.1088,
            operatingIncomeGrowth: 0.3323,
            netIncomeGrowth: 0.3122,
          },
        ],
      },
      valuationNote: null,
    })
  ),

  http.get("/api/stocksim/stocks/:symbol/analysis", ({ params }) =>
    HttpResponse.json({
      symbol: params.symbol,
      name: "삼성전자",
      asOf: "2026-10-30T05:00:00.000Z",
      price: 77_000,
      score: 18,
      rating: "BUY",
      ratingLabel: "매수",
      summary: "종합 점수 +18점으로 '매수' 신호입니다. 긍정 요인: RSI(14), PER.",
      factors: [
        { key: "rsi", category: "momentum", label: "RSI(14)", score: 15, maxScore: 15, signal: "positive", reason: "RSI 28.0 로 과매도 구간(30 미만)입니다." },
        { key: "macd", category: "momentum", label: "MACD(12,26,9)", score: -8, maxScore: 12, signal: "negative", reason: "MACD 가 시그널선 아래에 있어 하락 탄력이 우세합니다." },
        { key: "per", category: "valuation", label: "PER", score: 5, maxScore: 8, signal: "positive", reason: "PER 11.7배로 다소 저평가 구간입니다." },
        { key: "short", category: "flow", label: "공매도 비중", score: 0, maxScore: 6, signal: "unavailable", reason: "공매도 데이터가 없습니다." },
      ],
      indicators: {
        ma5: 76_000,
        ma20: 75_000,
        ma60: 74_000,
        ma120: 73_000,
        rsi14: 28,
        macd: -120,
        macdSignal: -80,
        bollingerUpper: 80_000,
        bollingerLower: 70_000,
        high52w: 90_000,
        low52w: 50_000,
        return1y: 0.25,
        maxDrawdown1y: 0.18,
      },
      disclaimer: "규칙 기반으로 계산한 교육용 신호이며 투자 권유가 아닙니다.",
    })
  ),

  http.get("/api/stocksim/stocks/:symbol/investors", () =>
    HttpResponse.json(
      Array.from({ length: 5 }, (_, i) => ({
        date: `2026-10-${30 - i}`,
        individual: -1000,
        foreigner: 700,
        institution: 300,
        otherCorporation: null,
        foreignerHoldingRate: 0.5,
        shortSellingRate: 0.02,
      }))
    )
  ),

  http.get("/api/stocksim/orderbook/:symbol", () =>
    HttpResponse.json({
      timestamp: "2026-10-30T05:00:00.000Z",
      asks: Array.from({ length: 10 }, (_, i) => ({ price: 77_000 + (10 - i) * 100, volume: 100 + i })),
      bids: Array.from({ length: 10 }, (_, i) => ({ price: 77_000 - i * 100, volume: 200 + i })),
      totalAskVolume: 1045,
      totalBidVolume: 2045,
    })
  ),

  http.get("/api/stocksim/trades/:symbol", () =>
    HttpResponse.json([
      { price: 77_000, volume: 10, time: "2026-10-30T05:00:00.000Z" },
      { price: 76_900, volume: 3, time: "2026-10-30T04:59:58.000Z" },
    ])
  ),

  http.get("/api/stocksim/portfolio", () => HttpResponse.json(mockPortfolio)),

  http.post("/api/stocksim/orders", async ({ request }) => {
    const order = (await request.json()) as { symbol: string; side: "BUY" | "SELL"; quantity: number };
    return HttpResponse.json({
      trade: {
        id: "t-2",
        symbol: order.symbol,
        name: "삼성전자",
        side: order.side,
        quantity: order.quantity,
        price: 77_000,
        amount: 77_000 * order.quantity,
        realizedPnl: order.side === "SELL" ? 7_000 * order.quantity : null,
        executedAt: "2026-10-30T05:00:00.000Z",
      },
      portfolio: mockPortfolio,
    });
  }),

  http.post("/api/stocksim/reset", () =>
    HttpResponse.json({
      ...mockPortfolio,
      cash: 10_000_000,
      holdings: [],
      trades: [],
      totalMarketValue: 0,
      totalAssets: 10_000_000,
      totalPnl: 0,
      totalReturnRate: 0,
    })
  ),

  // --- 로그인 상태 (기본은 로그인됨. 비로그인 화면은 테스트에서 server.use 로 바꾼다) ---
  http.get("/api/auth/me", () => HttpResponse.json({ authenticated: true, name: "테스터" })),

  // --- 항공권 ---
  http.get("/api/flights/quota", () => HttpResponse.json({ remainingSearches: 30 })),

  http.get("/api/flights/search", ({ request }) => {
    const q = new URL(request.url).searchParams;
    const query = {
      from: q.get("from"),
      to: q.get("to"),
      date: q.get("date"),
      tripType: q.get("tripType") ?? "oneway",
      adults: Number(q.get("adults") ?? 1),
      ...(q.get("returnDate") ? { returnDate: q.get("returnDate") } : {}),
    };
    return HttpResponse.json({ ...mockFlightResult, query });
  }),

  // 왕복: 가는 편 토큰 → 오는 편 (각각 판매처 토큰을 가진다)
  http.get("/api/flights/returns", () =>
    HttpResponse.json({
      options: [
        {
          ...mockFlightResult.options[1],
          id: "KE 704",
          price: 410_000,
          departureTime: "2026-12-05 12:00",
          arrivalTime: "2026-12-05 14:30",
          bookingToken: "bk-round",
          departureToken: null,
        },
      ],
      remainingSearches: 28,
      cached: false,
    })
  ),

  http.get("/api/flights/booking", () => HttpResponse.json(mockBookingResult)),
];

export const mockBookingResult = {
  options: [
    {
      seller: "트립닷컴",
      isAirline: false,
      logo: null,
      price: 180_000,
      fareName: "이코노미",
      conditions: ["환불 불가"],
      baggage: [],
      request: { url: "https://www.google.com/travel/clk/f", postData: "u=AAA_bbb%2Dccc" },
      phone: null,
      separateTickets: false,
      legs: [],
    },
    {
      seller: "제주항공",
      isAirline: true,
      logo: null,
      price: 195_000,
      fareName: null,
      conditions: [],
      baggage: ["위탁 수하물 15kg"],
      request: { url: "https://www.jejuair.net/booking", postData: null },
      phone: null,
      separateTickets: false,
      legs: [],
    },
    {
      seller: "전화여행사",
      isAirline: false,
      logo: null,
      price: 199_000,
      fareName: null,
      conditions: [],
      baggage: [],
      request: null,
      phone: "02-000-0000",
      separateTickets: false,
      legs: [],
    },
  ],
  googleFlightsUrl: "https://www.google.com/travel/flights?b=1",
  remainingSearches: 28,
  cached: false,
};

function mockSegment(flightNumber: string, airline: string, from: string, to: string, dep: string, arr: string) {
  return {
    airline,
    airlineLogo: null,
    flightNumber,
    departureAirport: { id: from, name: `${from} 공항` },
    departureTime: dep,
    arrivalAirport: { id: to, name: `${to} 공항` },
    arrivalTime: arr,
    durationMinutes: 120,
    airplane: null,
    travelClass: "이코노미",
  };
}

export const mockFlightResult = {
  query: { from: "ICN", to: "NRT", date: "2026-12-01", tripType: "oneway", adults: 1 },
  currency: "KRW",
  lowestPrice: 180_000,
  options: [
    {
      id: "7C 1101|7C 1151",
      price: 180_000,
      totalDurationMinutes: 300,
      stops: 1,
      airlines: ["제주항공"],
      departureTime: "2026-12-01 06:00",
      arrivalTime: "2026-12-01 11:00",
      segments: [
        mockSegment("7C 1101", "제주항공", "ICN", "PUS", "2026-12-01 06:00", "2026-12-01 07:00"),
        mockSegment("7C 1151", "제주항공", "PUS", "NRT", "2026-12-01 09:00", "2026-12-01 11:00"),
      ],
      layovers: [{ id: "PUS", name: "김해국제공항", durationMinutes: 120, overnight: false }],
      best: false,
      bookingToken: "bk-7c",
      departureToken: "dep-7c",
    },
    {
      id: "KE 703",
      price: 320_000,
      totalDurationMinutes: 140,
      stops: 0,
      airlines: ["대한항공"],
      departureTime: "2026-12-01 23:00",
      arrivalTime: "2026-12-02 01:20",
      segments: [mockSegment("KE 703", "대한항공", "ICN", "NRT", "2026-12-01 23:00", "2026-12-02 01:20")],
      layovers: [],
      best: true,
      bookingToken: "bk-ke",
      departureToken: "dep-ke",
    },
  ],
  priceInsights: { lowestPrice: 180_000, priceLevel: "low", typicalRange: [200_000, 400_000] },
  googleFlightsUrl: "https://www.google.com/travel/flights?q=test",
  fetchedAt: "2026-11-04T01:00:00.000Z",
  remainingSearches: 29,
  cached: false,
};
