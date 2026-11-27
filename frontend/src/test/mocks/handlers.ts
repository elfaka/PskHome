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

export const mockTraderSummary = {
  account: { name: "paper-default", broker: "paper", createdAt: "2026-11-26T00:00:00.000Z" },
  cash: "9124526.0000",
  marketValue: "981400.0000",
  equity: "10105926.0000",
  dayStartEquity: "10000000.0000",
  dayPnl: "105926.0000",
  initialCash: "10000000.0000",
  cumReturn: "0.010593",
  dailyLossLimit: "300000",
  lossUsage: "0",
  maxPositionValue: "5000000",
  positions: [
    {
      symbol: "005930", qty: "14.000000", avgPrice: "70100.0000", lastPrice: "70100.0000",
      lastPriceAt: "2026-11-26T06:19:50.000Z", marketValue: "981400.0000", unrealizedPnl: "-1400.0000", realizedPnl: "0.0000",
      weight: "0.097111", limitUsage: "0.196280",
    },
  ],
  openOrders: 0,
  killswitch: { halted: false, reason: null, updatedAt: null },
  lastQuoteAt: "2026-11-26T06:19:50.000Z",
  lastDecisionAt: "2026-11-26T06:19:00.000Z",
};

export const mockTraderDecisions = [
  {
    id: 2, ts: "2026-11-26T00:31:00.000Z", barTs: "2026-11-26T00:30:00.000Z", strategyId: "intraday_score",
    symbol: "005930", action: "BUY", reason: "합계 90 ≥ 80, VWAP 위, 거래량 2.0배", shadow: true, score: "90.00",
    confidence: "0.9000", riskResult: "SHADOW", riskReason: "그림자 전략 — 주문하지 않음", clientOrderId: null,
    entryPrice: null, stopLoss: null, takeProfit: null, riskReward: null, reasons: ["technical: 30/30"],
    parts: {
      technical: { points: "30", max: "30", note: "VWAP 위, 거래량 2.0배", available: true },
      flow: { points: "25", max: "25", note: "순매수: 외국인, 기관", available: true },
      global: { points: "0", max: "15", note: "VIX 데이터 없음·지연", available: false },
    },
    ma: null, invalidation: ["VWAP 하회", "거래량 감소"], validUntil: "2026-11-26T00:36:00.000Z",
    components: {
      price: { kind: "price", source: "rules", model_version: "rules-v1", points: "30", max: "30" },
      context: { kind: "context", source: "rules", model_version: "rules-v1", points: "60", max: "60" },
      issue: { status: "NOT_CONFIGURED", points: "0", max: "10", veto: false, source: "none" },
    },
  },
  {
    id: 1, ts: "2026-11-26T00:31:00.000Z", barTs: "2026-11-26T00:30:00.000Z", strategyId: "ma_cross",
    symbol: "005930", action: "BUY", reason: "golden cross", shadow: false, score: null, confidence: null,
    riskResult: "APPROVED", riskReason: null, clientOrderId: "ma_cross-005930-20261126T003000-B-abc",
    entryPrice: "70135.0000", stopLoss: "69985.0000", takeProfit: "70435.0000", riskReward: "1.0500",
    reasons: null, components: null, parts: null, ma: { fast: "70120", slow: "70050.5", diff: "69.5" }, invalidation: null, validUntil: null,
  },
  {
    id: 0, ts: "2026-11-26T00:29:00.000Z", barTs: "2026-11-26T00:28:00.000Z", strategyId: "ma_cross",
    symbol: "000660", action: "BUY", reason: "golden cross", shadow: false, score: null, confidence: null,
    riskResult: "REJECTED", riskReason: "LOW_RISK_REWARD: 비용 차감 손익비 0.92 < 1.5", clientOrderId: null,
    entryPrice: "1100000.0000", stopLoss: "1095000.0000", takeProfit: "1109000.0000", riskReward: "0.9200",
    reasons: null, components: null, parts: null, ma: null, invalidation: null, validUntil: null,
  },
];

const TUNED_BASE = {
  commission_rate_buy: "0.00015", commission_rate_sell: "0.00015", sell_tax_rate: "0.002", fee_rounding: "down",
  slippage_bps: "5", participation_rate: "0.1", strategy_order_value: "2000000", risk_max_order_value: "2500000",
  risk_max_position_value: "5000000", risk_daily_loss_limit: "300000", risk_atr_stop_mult: "1.5",
  risk_atr_take_mult: "3", risk_min_risk_reward: "1.5", risk_max_spread_bps: "30",
  entry_cutoff: "15:00:00", eod_exit: "15:15:00",
  universe_mode: "auto", universe_max_symbols: "10", universe_pinned: "005930", risk_max_open_positions: "3",
};

export const mockTraderStatus = {
  serverTime: "2026-11-26T01:00:00.000Z",
  engine: {
    state: "running", heartbeatAt: "2026-11-26T00:59:58.000Z", startedAt: "2026-11-26T00:00:00.000Z",
    mode: "paper", feed: "stocksim", dbOk: true, dataIssues: {},
  },
  killswitch: { halted: false, reason: null, updatedAt: null, updatedBy: null },
  lastQuoteAt: "2026-11-26T00:59:57.000Z",
  lastQuoteBySymbol: { "005930": "2026-11-26T00:59:57.000Z" },
  marketOpen: true,
  marketPhase: "continuous",
  switches: {},
  settings: {
    ready: true,
    values: { ...TUNED_BASE, risk_min_risk_reward: "1.2" },
    effective: { ...TUNED_BASE, risk_min_risk_reward: "1.2" },
    savedVersion: 2,
    savedAt: "2026-11-26T00:40:00.000Z",
    savedBy: "web:owner",
    appliedVersion: 2,
    pending: null,
    rejected: null,
    previousVersion: 1,
    envIgnored: [],
    info: {
      mode: "paper", feed: "stocksim", account: "paper-default", symbols: ["005930", "000660"],
      strategies: [{ id: "ma_cross", shadow: false }, { id: "intraday_score", shadow: true }],
      paper_initial_cash: "10000000", bar_interval_seconds: 60, market_open: "09:00:00", market_close: "15:20:00",
    },
  },
  universe: {
    date: "2026-11-26",
    mode: "auto",
    source: "rankings",
    at: "2026-11-25T23:50:00.000Z",
    symbols: [
      { symbol: "005930", name: "삼성전자", score: null, foreigner: null, institution: null, pinned: true },
      { symbol: "000660", name: "SK하이닉스", score: "35012345678", foreigner: "30000000000", institution: "5012345678", pinned: false },
    ],
    excluded: [{ symbol: "069500", name: "KODEX 200", reason: "주식 아님 (ETF)" }],
    watching: ["005930", "000660", "035420"],
  },
  alerts: [],
};

export const mockTraderStrategies = [
  {
    id: "ma_cross", shadow: false, enabled: true,
    today: { decisions: 120, signals: 3, orders: 1, fills: 1, rejected: 2 },
    lastDecisionAt: "2026-11-26T00:59:00.000Z",
    recent: [
      { ts: "2026-11-26T00:58:00.000Z", symbol: "005930", action: "HOLD", riskResult: null },
      { ts: "2026-11-26T00:59:00.000Z", symbol: "005930", action: "BUY", riskResult: "APPROVED" },
    ],
  },
  {
    id: "intraday_score", shadow: true, enabled: true,
    today: { decisions: 120, signals: 5, orders: 0, fills: 0, rejected: 0 },
    lastDecisionAt: "2026-11-26T00:59:00.000Z",
    recent: [{ ts: "2026-11-26T00:59:00.000Z", symbol: "005930", action: "BUY", riskResult: "SHADOW" }],
  },
];

const act = (a: Record<string, unknown>) => ({
  code: null, strategyId: null, by: null, diff: null, detail: null, groupKey: String(a.id), ...a,
});

export const mockTraderActivity = [
  act({
    id: "event-3", ts: "2026-11-26T00:42:00.000Z", level: "warn", source: "event", kind: "ORDER_REJECTED", symbol: "005930",
    category: "risk", title: "위험 관리가 주문을 막음", code: "LOW_RISK_REWARD", detail: "비용 차감 손익비 0.92 < 1.5",
    groupKey: "ORDER_REJECTED:LOW_RISK_REWARD:005930", message: "위험 관리가 주문을 막음 · 비용 차감 손익비 0.92 < 1.5",
  }),
  act({
    id: "event-4", ts: "2026-11-26T00:41:00.000Z", level: "warn", source: "event", kind: "ORDER_REJECTED", symbol: "005930",
    category: "risk", title: "위험 관리가 주문을 막음", code: "LOW_RISK_REWARD", detail: "비용 차감 손익비 0.95 < 1.5",
    groupKey: "ORDER_REJECTED:LOW_RISK_REWARD:005930", message: "위험 관리가 주문을 막음 · 비용 차감 손익비 0.95 < 1.5",
  }),
  act({
    id: "event-2", ts: "2026-11-26T00:40:00.000Z", level: "info", source: "event", kind: "SETTINGS_APPLIED", symbol: null,
    category: "settings", title: "엔진이 설정 적용 (v2)", by: "web:owner",
    diff: [{ key: "risk_min_risk_reward", before: "1.5", after: "1.2" }, { key: "slippage_bps", before: "5", after: "7" }],
    message: "엔진이 설정 적용 (v2)",
  }),
  act({
    id: "fill-1", ts: "2026-11-26T00:31:10.000Z", level: "info", source: "fill", kind: "BUY", symbol: "005930",
    category: "trade", title: "매수 체결", detail: "13주 × 70,171원", strategyId: "ma_cross", message: "매수 체결 · 13주 × 70,171원",
  }),
  act({
    id: "event-1", ts: "2026-11-26T00:20:00.000Z", level: "warn", source: "event", kind: "DATA_GAP", symbol: "000660",
    category: "data", title: "봉 누락 3개", detail: "지표를 다시 쌓는 동안 그 종목은 신규 매수를 하지 않습니다", message: "봉 누락 3개",
  }),
];

export const mockTraderChart = {
  symbol: "005930",
  interval: 60,
  tradeDate: "2026-11-26",
  symbols: ["005930", "000660"],
  bars: [
    { t: "2026-11-26T00:30:00.000Z", o: "70000.0000", h: "70200.0000", l: "69900.0000", c: "70100.0000", v: "1200.000000" },
    { t: "2026-11-26T00:31:00.000Z", o: "70100.0000", h: "70300.0000", l: "70000.0000", c: "70200.0000", v: "900.000000" },
  ],
  lines: [{ t: "2026-11-26T00:31:00.000Z", vwap: "70050.5", sma20: "69980.25" }],
  fills: [{ t: "2026-11-26T00:31:00.000Z", ts: "2026-11-26T00:31:10.000Z", side: "BUY", qty: "13.000000", price: "70171.0000", strategyId: "ma_cross" }],
  signals: [{ t: "2026-11-26T00:31:00.000Z", ts: "2026-11-26T00:31:00.100Z", strategyId: "ma_cross", action: "BUY", shadow: false, riskResult: "APPROVED" }],
  position: { qty: "13.000000", avgPrice: "70171.0000", stopLoss: "69400.0000", takeProfit: "71600.0000" },
  indicators: {
    barTs: "2026-11-26T00:31:00.000Z", close: "70200", vwap: "70050.5", vwapGap: "0.002134", sma20: "69980.25",
    rsi14: "72.4", macdHist: "-12.5", atr14: "310.2", volumeRatio: "1.8200",
  },
};

export const mockTraderScores = {
  symbol: "005930",
  tradeDate: "2026-11-26",
  thresholds: { buy: "80", watch: "65", exit: "30" },
  points: [
    { t: "2026-11-26T00:30:00.000Z", action: "WAIT", total: "42.00", price: "12", context: "30", issue: "0" },
    { t: "2026-11-26T00:31:00.000Z", action: "WAIT", total: "57.00", price: "22", context: "35", issue: "0" },
  ],
  latest: {
    ts: "2026-11-26T00:31:00.100Z",
    parts: {
      technical: { points: "22", max: "30", note: "VWAP 위, 거래량 1.8배", available: true },
      flow: { points: "15", max: "25", note: "순매수: 외국인, 기관", available: true },
      market: { points: "14", max: "20", note: "코스피 +0.32%", available: true },
      global: { points: "0", max: "15", note: "VIX 데이터 없음·지연", available: false },
      news: { points: "0", max: "10", note: "뉴스·공시 해석 없음 (3단계)", available: false },
    },
  },
};

export const mockTraderStats = {
  today: { fills: 4, buys: 2, sells: 2, commission: "120.0000", tax: "2800.0000", slippage: "500.0000", costs: "2920.0000", avgPlannedRiskReward: "1.2000" },
  trips: {
    today: { count: 2, wins: 1, winRate: "0.500000", netPnl: "-100.0000", avgPnl: "-50.0000" },
    all: { count: 10, wins: 5, winRate: "0.500000", netPnl: "4378.0000", avgPnl: "437.8000" },
  },
  realizedPnl: "24420.0000",
  unrealizedPnl: "-3300.0000",
  rejections: [
    { code: "LOW_RISK_REWARD", count: 7, sample: "LOW_RISK_REWARD: 비용 차감 손익비 0.92 < 1.5" },
    { code: "WIDE_SPREAD", count: 1, sample: "WIDE_SPREAD: 호가 스프레드 40.0bp > 30bp" },
  ],
};

export const handlers = [
  // 자동매매(/trader) — 기본은 비로그인. 로그인 흐름은 테스트에서 server.use 로 바꾼다
  http.get("/api/trader/auth/me", () => HttpResponse.json({ authenticated: false, totpRequired: false })),
  http.post("/api/trader/auth/logout", () => HttpResponse.json({ ok: true })),
  http.post("/api/trader/auth/login", () =>
    HttpResponse.json(
      { error: { code: "LOGIN_FAILED", message: "아이디 또는 비밀번호가 올바르지 않습니다." } },
      { status: 401 }
    )
  ),

  // 자동매매 대시보드 (금액은 Decimal 문자열)
  http.get("/api/trader/summary", () => HttpResponse.json(mockTraderSummary)),
  http.get("/api/trader/status", () => HttpResponse.json(mockTraderStatus)),
  http.get("/api/trader/equity", () =>
    HttpResponse.json({
      points: [
        { date: "2026-11-25", equity: "10000000.0000", drawdown: "0.000000" },
        { date: "2026-11-26", equity: "10000000.0000", drawdown: "0.000000" },
      ],
      mdd: "-0.004500",
      current: { equity: "9955000.0000", drawdown: "-0.004500" },
    })
  ),
  http.get("/api/trader/chart", () => HttpResponse.json(mockTraderChart)),
  http.get("/api/trader/scores", () => HttpResponse.json(mockTraderScores)),
  http.get("/api/trader/stats", () => HttpResponse.json(mockTraderStats)),
  http.get("/api/trader/strategies", () => HttpResponse.json(mockTraderStrategies)),
  http.get("/api/trader/activity", () => HttpResponse.json(mockTraderActivity)),
  http.post("/api/trader/control/halt", () => HttpResponse.json({ ok: true })),
  http.post("/api/trader/control/resume", () => HttpResponse.json({ ok: true })),
  http.post("/api/trader/control/strategies/:id", () => HttpResponse.json({ ok: true })),
  http.put("/api/trader/control/settings", () => HttpResponse.json({ version: 3, values: {} })),
  http.post("/api/trader/control/settings/revert", () => HttpResponse.json({ version: 3, restored: 1, values: {} })),
  http.post("/api/trader/auth/step-up", () => HttpResponse.json({ stepUpUntil: "2099-01-01T00:00:00.000Z" })),
  http.get("/api/trader/decisions", () => HttpResponse.json(mockTraderDecisions)),
  http.get("/api/trader/performance", () =>
    HttpResponse.json([
      {
        strategyId: "intraday_score", action: "BUY", horizon: "5m", count: 4,
        avgReturnPct: "0.001234", winRate: "0.75", avgMfePct: "0.004", avgMaePct: "-0.002", pending: 1,
      },
    ])
  ),
  http.get("/api/trader/orders", () =>
    HttpResponse.json([
      {
        clientOrderId: "ma_cross-005930-20261126T003000-B-abc", symbol: "005930", side: "BUY", orderType: "MARKET",
        qty: "13.000000", limitPrice: null, status: "FILLED", filledQty: "13.000000", avgFillPrice: "70171.0000",
        strategyId: "ma_cross", rejectReason: null, createdAt: "2026-11-26T00:31:00.000Z", updatedAt: "2026-11-26T00:31:10.000Z",
      },
    ])
  ),
  http.get("/api/trader/fills", () => HttpResponse.json([])),
  http.get("/api/trader/risk-events", () =>
    HttpResponse.json([{ id: 1, ts: "2026-11-26T00:00:01.000Z", kind: "RECOVERED", symbol: null, clientOrderId: null, detail: { cash: "10000000" } }])
  ),

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
        {
          key: "rsi",
          category: "momentum",
          label: "RSI(14)",
          score: 15,
          maxScore: 15,
          signal: "positive",
          reason: "RSI 28.0 로 과매도 구간(30 미만)입니다.",
          description: "RSI(상대강도지수)는 최근 14일 동안 오른 폭과 내린 폭을 비교해 0~100 으로 나타낸 값입니다.",
          values: [{ label: "RSI(14)", value: "28.0" }],
          rules: [
            { condition: "30 미만 (과매도)", points: 15, matched: true },
            { condition: "30 이상 45 미만 (약세)", points: 5, matched: false },
            { condition: "45 이상 55 이하 (중립)", points: 0, matched: false },
            { condition: "55 초과 70 이하 (강세)", points: -5, matched: false },
            { condition: "70 초과 (과매수)", points: -15, matched: false },
          ],
          caution: "강한 하락 추세에서는 RSI 가 30 아래에 오래 머물 수 있습니다.",
        },
        {
          key: "macd",
          category: "momentum",
          label: "MACD(12,26,9)",
          score: -8,
          maxScore: 12,
          signal: "negative",
          reason: "MACD 가 시그널선 아래에 있어 하락 탄력이 우세합니다.",
          description: "MACD 는 12일 지수이동평균에서 26일 지수이동평균을 뺀 값입니다.",
          values: [
            { label: "MACD", value: "-120.0" },
            { label: "시그널", value: "-80.0" },
          ],
          rules: [
            { condition: "MACD 가 시그널선 위", points: 8, matched: false },
            { condition: "MACD 가 시그널선 아래", points: -8, matched: true },
          ],
          caution: "신호가 늦게 나옵니다.",
        },
        {
          key: "per",
          category: "valuation",
          label: "PER",
          score: 5,
          maxScore: 8,
          signal: "positive",
          reason: "PER 11.7배로 다소 저평가 구간입니다.",
          description: "PER(주가수익비율) = 주가 ÷ 주당순이익(EPS).",
          values: [{ label: "PER", value: "11.7배" }],
          rules: [
            { condition: "8배 미만", points: 8, matched: false },
            { condition: "8배 이상 12배 미만", points: 5, matched: true },
          ],
          caution: "업종마다 평균 PER 이 다릅니다.",
        },
        {
          key: "short",
          category: "flow",
          label: "공매도 비중",
          score: 0,
          maxScore: 6,
          signal: "unavailable",
          reason: "공매도 데이터가 없습니다.",
          description: "공매도 비중 = 공매도 거래량 ÷ 전체 거래량.",
          values: [],
          rules: [{ condition: "평균 2% 미만 (낮음)", points: 2, matched: false }],
          caution: null,
        },
        {
          key: "op-growth",
          category: "growth",
          label: "영업이익 성장",
          score: 8,
          maxScore: 8,
          signal: "positive",
          reason: "영업이익이 6,567억원에서 3.3조원으로 흑자 전환했습니다.",
          description: "최근 사업연도 영업이익이 전년보다 얼마나 늘었는지입니다.",
          values: [{ label: "전년 대비", value: "+398.3%" }],
          rules: [
            { condition: "+30% 이상", points: 8, matched: false },
            { condition: "흑자 전환 (전년 적자 → 올해 흑자)", points: 8, matched: true },
          ],
          caution: "업황을 크게 타는 업종은 이익이 가장 많이 늘었을 때가 고점인 경우가 많습니다.",
        },
      ],
      ratingScale: [
        { rating: "STRONG_BUY", label: "강력 매수", min: 45, range: "+45 이상" },
        { rating: "BUY", label: "매수", min: 18, range: "+18 ~ +44" },
        { rating: "NEUTRAL", label: "중립", min: -17, range: "-17 ~ +17" },
        { rating: "SELL", label: "매도", min: -44, range: "-44 ~ -18" },
        { rating: "STRONG_SELL", label: "강력 매도", min: -100, range: "-45 이하" },
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

  http.get("/api/stocksim/stocks/:symbol/investors/intraday", ({ params }) =>
    HttpResponse.json({
      symbol: params.symbol,
      date: "2026-10-30",
      latestDate: "2026-10-30",
      // 외국인은 10:30 에 고점을 찍고 줄었고, 기관은 계속 늘었다
      points: [
        { at: "2026-10-30T09:30:00+09:00", foreigner: 1_000, institution: 100 },
        { at: "2026-10-30T10:30:00+09:00", foreigner: 50_000, institution: 300 },
        { at: "2026-10-30T13:30:00+09:00", foreigner: 20_000, institution: 900 },
      ],
      collecting: true,
    })
  ),

  http.get("/api/stocksim/rankings/investors", ({ request }) => {
    const investor = new URL(request.url).searchParams.get("investor") ?? "foreigner";
    if (investor === "institution") {
      return HttpResponse.json({ investor, rankedAt: null, netBuy: [], netSell: [] });
    }
    return HttpResponse.json({
      investor,
      rankedAt: "2026-10-30T14:30:00+09:00",
      netBuy: [
        { rank: 1, symbol: "000660", name: "SK하이닉스", amount: 120_000_000_000, price: 200_000, changeRate: 0.031 },
        { rank: 2, symbol: "005930", name: "삼성전자", amount: 80_000_000_000, price: 77_000, changeRate: 0.013 },
      ],
      netSell: [{ rank: 1, symbol: "035720", name: "카카오", amount: 30_000_000_000, price: 40_000, changeRate: -0.02 }],
    });
  }),

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
];
