import { describe, it, expect, beforeEach, vi } from "vitest";

import { createFakeTossClient, krStock, type FakeTossClient } from "../../testing/fakeTossClient.js";

const holder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("./toss/tossClient.js", () => ({ getTossClient: () => holder.client }));

const { applyExecution, createPortfolio, getPortfolioView, placeOrder, valuate } = await import(
  "./stockSim.service.js"
);
const { resetMarketDataCache } = await import("./marketData.service.js");
const { INITIAL_CASH } = await import("./stockSim.types.js");

const at = new Date("2026-10-30T01:00:00Z");

function buy(state = createPortfolio(), quantity = 10, price = 70_000) {
  return applyExecution(state, { symbol: "005930", name: "삼성전자", side: "BUY", quantity, price, executedAt: at });
}

describe("applyExecution", () => {
  it("starts with 10,000,000 KRW and no holdings", () => {
    const state = createPortfolio();

    expect(state.cash).toBe(INITIAL_CASH);
    expect(state.cash).toBe(10_000_000);
    expect(state.holdings).toEqual({});
    expect(state.trades).toEqual([]);
  });

  it("buying deducts cash and adds the holding at cost", () => {
    const { state, trade } = buy();

    expect(state.cash).toBe(10_000_000 - 700_000);
    expect(state.holdings["005930"]).toMatchObject({ quantity: 10, costBasis: 700_000 });
    expect(trade).toMatchObject({ side: "BUY", quantity: 10, price: 70_000, amount: 700_000, realizedPnl: null });
    expect(state.trades[0]).toBe(trade);
  });

  it("does not mutate the previous state", () => {
    const initial = createPortfolio();
    buy(initial);

    expect(initial.cash).toBe(INITIAL_CASH);
    expect(initial.holdings).toEqual({});
  });

  it("averages the cost basis across buys", () => {
    const first = buy(undefined, 10, 70_000).state;
    const { state } = buy(first, 10, 80_000);

    const view = valuate(state, new Map());
    expect(view.holdings[0]).toMatchObject({ quantity: 20, avgPrice: 75_000, costBasis: 1_500_000 });
  });

  it("rejects a buy that exceeds cash", () => {
    expect(() => buy(createPortfolio(), 143, 70_000)).toThrowError(
      expect.objectContaining({ status: 400, code: "INSUFFICIENT_CASH" })
    );
  });

  it("allows spending exactly all the cash", () => {
    const { state } = buy(createPortfolio(), 100, 100_000);

    expect(state.cash).toBe(0);
  });

  it("selling keeps the average price and records realized PnL", () => {
    const bought = buy(buy(undefined, 10, 70_000).state, 10, 80_000).state; // 평균 75,000

    const { state, trade } = applyExecution(bought, {
      symbol: "005930",
      name: "삼성전자",
      side: "SELL",
      quantity: 5,
      price: 90_000,
      executedAt: at,
    });

    expect(trade.realizedPnl).toBe((90_000 - 75_000) * 5);
    expect(state.realizedPnl).toBe(75_000);
    expect(state.holdings["005930"]).toMatchObject({ quantity: 15, costBasis: 1_125_000 });
    expect(valuate(state, new Map()).holdings[0].avgPrice).toBe(75_000);
    expect(state.cash).toBe(10_000_000 - 1_500_000 + 450_000);
  });

  it("removes the holding when fully sold", () => {
    const bought = buy().state;

    const { state } = applyExecution(bought, {
      symbol: "005930",
      name: "삼성전자",
      side: "SELL",
      quantity: 10,
      price: 60_000,
      executedAt: at,
    });

    expect(state.holdings).toEqual({});
    expect(state.realizedPnl).toBe(-100_000);
  });

  it("rejects selling more than held, or a stock not held", () => {
    const bought = buy().state;
    const sell = (quantity: number, symbol = "005930") =>
      applyExecution(bought, { symbol, name: "x", side: "SELL", quantity, price: 1, executedAt: at });

    expect(() => sell(11)).toThrowError(expect.objectContaining({ code: "INSUFFICIENT_QUANTITY" }));
    expect(() => sell(1, "000660")).toThrowError(expect.objectContaining({ code: "INSUFFICIENT_QUANTITY" }));
  });

  it("keeps only the most recent trades", () => {
    let state = createPortfolio();
    for (let i = 0; i < 205; i++) state = buy(state, 1, 1).state;

    expect(state.trades).toHaveLength(200);
  });
});

describe("valuate", () => {
  it("values holdings at the current price", () => {
    const { state } = buy(); // 10주 @ 70,000

    const view = valuate(state, new Map([["005930", 77_000]]));

    expect(view.holdings[0]).toMatchObject({
      currentPrice: 77_000,
      marketValue: 770_000,
      unrealizedPnl: 70_000,
      returnRate: 0.1,
    });
    expect(view.totalMarketValue).toBe(770_000);
    expect(view.totalAssets).toBe(9_300_000 + 770_000);
    expect(view.totalPnl).toBe(70_000);
    expect(view.totalReturnRate).toBeCloseTo(0.007);
  });

  it("falls back to cost when the price is missing", () => {
    const { state } = buy();

    const view = valuate(state, new Map());

    expect(view.holdings[0]).toMatchObject({ currentPrice: null, marketValue: 700_000, unrealizedPnl: null });
    expect(view.totalAssets).toBe(INITIAL_CASH);
  });
});

describe("placeOrder", () => {
  let toss: FakeTossClient;

  beforeEach(() => {
    toss = createFakeTossClient();
    holder.client = toss;
    resetMarketDataCache();
  });

  it("fills a market buy at the Toss last price", async () => {
    const { state, result } = await placeOrder(createPortfolio(), { symbol: "005930", side: "BUY", quantity: 3 });

    expect(result.trade).toMatchObject({ name: "삼성전자", price: 70_000, amount: 210_000 });
    expect(state.cash).toBe(10_000_000 - 210_000);
    expect(result.portfolio.holdings[0]).toMatchObject({ symbol: "005930", currentPrice: 70_000 });
  });

  it("normalizes lower-case symbols", async () => {
    toss.stocks.set("0101N0", krStock("0101N0", "테스트ETF"));
    toss.prices.set("0101N0", 10_000);

    const { result } = await placeOrder(createPortfolio(), { symbol: "0101n0", side: "BUY", quantity: 1 });

    expect(result.trade.symbol).toBe("0101N0");
  });

  it("rejects US stocks", async () => {
    await expect(
      placeOrder(createPortfolio(), { symbol: "AAPL", side: "BUY", quantity: 1 })
    ).rejects.toMatchObject({ code: "UNSUPPORTED_SYMBOL" });
  });

  it("rejects suspended or delisted stocks", async () => {
    toss.stocks.set(
      "000660",
      krStock("000660", "SK하이닉스", {
        koreanMarketDetail: {
          liquidationTrading: false,
          nxtSupported: false,
          krxTradingSuspended: true,
          nxtTradingSuspended: null,
        },
      })
    );
    toss.stocks.set("111111", krStock("111111", "상폐", { status: "DELISTED" }));

    await expect(
      placeOrder(createPortfolio(), { symbol: "000660", side: "BUY", quantity: 1 })
    ).rejects.toMatchObject({ code: "TRADING_SUSPENDED" });
    await expect(
      placeOrder(createPortfolio(), { symbol: "111111", side: "BUY", quantity: 1 })
    ).rejects.toMatchObject({ code: "UNSUPPORTED_SYMBOL" });
  });

  it("rejects an unknown symbol with 404", async () => {
    await expect(
      placeOrder(createPortfolio(), { symbol: "999999", side: "BUY", quantity: 1 })
    ).rejects.toMatchObject({ status: 404, code: "STOCK_NOT_FOUND" });
  });

  it("rejects when there is no price", async () => {
    toss.prices.delete("005930");

    await expect(
      placeOrder(createPortfolio(), { symbol: "005930", side: "BUY", quantity: 1 })
    ).rejects.toMatchObject({ code: "PRICE_UNAVAILABLE" });
  });
});

describe("getPortfolioView", () => {
  beforeEach(() => {
    resetMarketDataCache();
  });

  it("does not call Toss when there are no holdings", async () => {
    const toss = createFakeTossClient();
    holder.client = toss;

    await getPortfolioView(createPortfolio());

    expect(toss.calls).toEqual([]);
  });

  it("still returns the portfolio when quotes fail", async () => {
    holder.client = {
      getPrices: async () => {
        throw new Error("boom");
      },
    };

    const view = await getPortfolioView(buy().state);

    expect(view.holdings[0].currentPrice).toBeNull();
  });
});
