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
      }))
    );
  }),

  http.get("/api/stocksim/candles/:symbol", ({ request }) => {
    const count = Number(new URL(request.url).searchParams.get("count") ?? 60);
    return HttpResponse.json(
      Array.from({ length: count }, (_, i) => ({
        time: new Date(Date.UTC(2026, 9, 30 - count + 1 + i)).toISOString(),
        open: 70_000,
        high: 78_000,
        low: 69_000,
        close: 70_000 + i * 100,
        volume: 1000,
      }))
    );
  }),

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
