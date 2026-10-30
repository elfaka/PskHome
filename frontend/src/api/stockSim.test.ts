import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "@/test/mocks/server";

import {
  getDailyCandles,
  getPortfolio,
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

  it("getDailyCandles requests the given count", async () => {
    const points = await getDailyCandles("005930", 5);
    expect(points).toHaveLength(5);
    expect(points[0]).toHaveProperty("close");
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
