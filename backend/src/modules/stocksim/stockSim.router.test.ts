import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

import { HttpError } from "../../lib/httpError.js";
import { createFakeTossClient, type FakeTossClient } from "../../testing/fakeTossClient.js";

/**
 * `/api/stocksim/**` — 토스 클라이언트만 fake 로 바꾸고 세션·라우터·서비스는 실제로 돈다.
 * supertest agent 가 쿠키를 들고 다니므로 같은 브라우저 세션처럼 동작한다.
 */
const holder = vi.hoisted(() => ({ client: null as unknown, notConfigured: false }));

vi.mock("./toss/tossClient.js", () => ({
  getTossClient: () => {
    if (holder.notConfigured) {
      throw new HttpError(503, "TOSS_NOT_CONFIGURED", "not configured");
    }
    return holder.client;
  },
}));

const { createApp } = await import("../../app.js");
const { resetMarketDataCache } = await import("./marketData.service.js");

const app = createApp();

describe("stocksim routes", () => {
  let toss: FakeTossClient;

  beforeEach(() => {
    toss = createFakeTossClient();
    holder.client = toss;
    holder.notConfigured = false;
    resetMarketDataCache();
  });

  it("is public: GET /api/stocksim/portfolio returns a fresh portfolio without a session cookie", async () => {
    const res = await request(app).get("/api/stocksim/portfolio");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cash: 10_000_000, totalAssets: 10_000_000, holdings: [], trades: [] });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("GET /api/stocksim/quotes returns numeric prices", async () => {
    const res = await request(app).get("/api/stocksim/quotes?symbols=005930,000660");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({ symbol: "005930", price: 70_000, currency: "KRW" }),
      expect.objectContaining({ symbol: "000660", price: 200_000 }),
    ]);
  });

  it("caches quotes briefly so repeated views hit Toss once", async () => {
    await request(app).get("/api/stocksim/quotes?symbols=005930");
    await request(app).get("/api/stocksim/quotes?symbols=005930");

    expect(toss.calls.filter((c) => c.method === "getPrices")).toHaveLength(1);
  });

  it("rejects invalid symbols with 400", async () => {
    const res = await request(app).get("/api/stocksim/quotes?symbols=00%2F59");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_SYMBOL");
  });

  it("GET /api/stocksim/candles/:symbol returns oldest first", async () => {
    const res = await request(app).get("/api/stocksim/candles/005930?count=5");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    expect(res.body[0].time < res.body[4].time).toBe(true);
    expect(toss.calls.at(-1)).toEqual({ method: "getCandles", args: ["005930", "1d", 5] });
  });

  it("rejects a candle count outside 1..200", async () => {
    const res = await request(app).get("/api/stocksim/candles/005930?count=500");

    expect(res.status).toBe(400);
  });

  it("GET /api/stocksim/search finds KOSPI and KOSDAQ stocks by name or code", async () => {
    const res = await request(app).get(`/api/stocksim/search?q=${encodeURIComponent("삼성")}`);

    expect(res.status).toBe(200);
    expect(res.body.map((s: { symbol: string }) => s.symbol)).toEqual(["005930", "005935"]);

    const byCode = await request(app).get("/api/stocksim/search?q=0357");
    expect(byCode.body).toEqual([expect.objectContaining({ symbol: "035720", market: "KOSDAQ" })]);
  }, 5_000);

  it("buys, keeps the portfolio in the session, then sells", async () => {
    const agent = request.agent(app);

    const bought = await agent.post("/api/stocksim/orders").send({ symbol: "005930", side: "BUY", quantity: 10 });
    expect(bought.status).toBe(200);
    expect(bought.body.trade).toMatchObject({ side: "BUY", price: 70_000, amount: 700_000 });
    expect(bought.body.portfolio.cash).toBe(9_300_000);

    toss.prices.set("005930", 75_000);
    resetMarketDataCache();

    const view = await agent.get("/api/stocksim/portfolio");
    expect(view.body.holdings[0]).toMatchObject({ quantity: 10, currentPrice: 75_000, unrealizedPnl: 50_000 });

    const sold = await agent.post("/api/stocksim/orders").send({ symbol: "005930", side: "SELL", quantity: 4 });
    expect(sold.body.trade.realizedPnl).toBe(20_000);
    expect(sold.body.portfolio.holdings[0].quantity).toBe(6);
    expect(sold.body.portfolio.trades).toHaveLength(2);

    // 다른 브라우저(쿠키 없음)는 영향을 받지 않는다.
    const other = await request(app).get("/api/stocksim/portfolio");
    expect(other.body.cash).toBe(10_000_000);
  });

  it("ignores a client-supplied price", async () => {
    const res = await request(app)
      .post("/api/stocksim/orders")
      .send({ symbol: "005930", side: "BUY", quantity: 1, price: 1 });

    expect(res.body.trade.price).toBe(70_000);
  });

  it.each([
    [{ symbol: "005930", side: "BUY", quantity: 0 }],
    [{ symbol: "005930", side: "BUY", quantity: 1.5 }],
    [{ symbol: "005930", side: "HOLD", quantity: 1 }],
    [{ side: "BUY", quantity: 1 }],
  ])("rejects an invalid order %j with 400 INVALID_ORDER", async (body) => {
    const res = await request(app).post("/api/stocksim/orders").send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ORDER");
  });

  it("rejects selling a stock that is not held", async () => {
    const res = await request(app).post("/api/stocksim/orders").send({ symbol: "005930", side: "SELL", quantity: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INSUFFICIENT_QUANTITY");
  });

  it("does not save the session when an order fails", async () => {
    const agent = request.agent(app);
    await agent.post("/api/stocksim/orders").send({ symbol: "005930", side: "BUY", quantity: 1 });

    const failed = await agent.post("/api/stocksim/orders").send({ symbol: "005930", side: "BUY", quantity: 1000 });
    expect(failed.body.error.code).toBe("INSUFFICIENT_CASH");

    const view = await agent.get("/api/stocksim/portfolio");
    expect(view.body.trades).toHaveLength(1);
  });

  it("POST /api/stocksim/reset restores the initial portfolio", async () => {
    const agent = request.agent(app);
    await agent.post("/api/stocksim/orders").send({ symbol: "005930", side: "BUY", quantity: 10 });

    const res = await agent.post("/api/stocksim/reset");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cash: 10_000_000, holdings: [], trades: [] });
    expect((await agent.get("/api/stocksim/portfolio")).body.trades).toEqual([]);
  });

  it("returns 503 TOSS_NOT_CONFIGURED for market data when keys are missing", async () => {
    holder.notConfigured = true;

    const res = await request(app).get("/api/stocksim/quotes?symbols=005930");

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("TOSS_NOT_CONFIGURED");
    // 보유 종목이 없으면 키가 없어도 포트폴리오는 열린다.
    expect((await request(app).get("/api/stocksim/portfolio")).status).toBe(200);
  });
});
