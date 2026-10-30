import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "@/test/mocks/server";

import {
  getAnalysis,
  getChart,
  getInvestorFlows,
  getOrderbook,
  getOverview,
  getPortfolio,
  getQuotesWithChange,
  getTrades,
  getQuotes,
  placeOrder,
  resetPortfolio,
  searchStocks,
} from "./stockSim";

describe("stockSim API functions", () => {
  it("searchStocks passes the query and returns matches", async () => {
    const result = await searchStocks("삼성");
    expect(result).toEqual([expect.objectContaining({ symbol: "005930", market: "KOSPI" })]);
  });

  it("getQuotes joins symbols with commas", async () => {
    let seen: string | null = null;
    server.use(
      http.get("/api/stocksim/quotes", ({ request }) => {
        seen = new URL(request.url).searchParams.get("symbols");
        return HttpResponse.json([]);
      })
    );

    await getQuotes(["005930", "000660"]);
    expect(seen).toBe("005930,000660");
  });

  it("getChart passes the timeframe and returns aligned indicators", async () => {
    let seen: string | null = null;
    server.use(
      http.get("/api/stocksim/chart/:symbol", ({ request }) => {
        seen = new URL(request.url).searchParams.get("timeframe");
        return HttpResponse.json({ symbol: "005930", timeframe: "1w", candles: [], indicators: {} });
      })
    );

    await getChart("005930", "1w");
    expect(seen).toBe("1w");

    server.resetHandlers();
    const chart = await getChart("005930", "1d");
    expect(chart.indicators.ma20).toHaveLength(chart.candles.length);
  });

  it("getQuotesWithChange asks for the change", async () => {
    let change: string | null = null;
    server.use(
      http.get("/api/stocksim/quotes", ({ request }) => {
        change = new URL(request.url).searchParams.get("change");
        return HttpResponse.json([]);
      })
    );

    await getQuotesWithChange(["005930"]);
    expect(change).toBe("1");
  });

  it("loads overview, analysis, flows, orderbook and trades", async () => {
    expect((await getOverview("005930")).valuation?.per).toBeGreaterThan(0);
    expect((await getAnalysis("005930")).factors.length).toBeGreaterThan(0);
    expect((await getInvestorFlows("005930"))[0]).toHaveProperty("foreigner");
    expect((await getOrderbook("005930")).asks).toHaveLength(10);
    expect((await getTrades("005930"))[0]).toHaveProperty("price");
  });

  it("getPortfolio returns the portfolio shape", async () => {
    const p = await getPortfolio();
    expect(p).toHaveProperty("cash");
    expect(p).toHaveProperty("totalAssets");
    expect(p.holdings[0]).toHaveProperty("avgPrice");
  });

  it("placeOrder sends symbol, side and quantity only", async () => {
    let body: unknown = null;
    server.use(
      http.post("/api/stocksim/orders", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ trade: { id: "x" }, portfolio: {} });
      })
    );

    await placeOrder({ symbol: "005930", side: "BUY", quantity: 3 });
    expect(body).toEqual({ symbol: "005930", side: "BUY", quantity: 3 });
  });

  it("placeOrder rejects with the backend error message", async () => {
    server.use(
      http.post("/api/stocksim/orders", () =>
        HttpResponse.json(
          { error: { code: "INSUFFICIENT_CASH", message: "예수금이 부족합니다." } },
          { status: 400 }
        )
      )
    );

    await expect(placeOrder({ symbol: "005930", side: "BUY", quantity: 1000 })).rejects.toMatchObject({
      response: { status: 400 },
    });
  });

  it("resetPortfolio returns an empty portfolio", async () => {
    const p = await resetPortfolio();
    expect(p.cash).toBe(10_000_000);
    expect(p.holdings).toEqual([]);
  });
});
