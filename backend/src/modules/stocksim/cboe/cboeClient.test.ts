import { describe, it, expect } from "vitest";

import { createCboeClient, easternToIso, parseVixHistory, parseVixQuote } from "./cboeClient.js";

/** 실제 `_VIX.json` 응답(2026-11-02 마감)에서 필요한 필드만 옮겼다. */
const QUOTE = {
  timestamp: "2026-11-03 02:30:16",
  data: {
    symbol: "^VIX",
    security_type: "index",
    current_price: 21.15,
    price_change: 1.73,
    price_change_percent: 8.1797,
    open: 19.05,
    high: 21.77,
    low: 18.03,
    close: 21.15,
    prev_day_close: 21.15,
    last_trade_time: "2026-11-02T16:15:01",
  },
  symbol: "_VIX",
};

const CSV = [
  "DATE,OPEN,HIGH,LOW,CLOSE",
  "10/29/2026,18.100000,19.200000,17.900000,18.500000",
  "10/30/2026,18.500000,19.900000,18.200000,19.420000",
  "11/02/2026,19.050000,21.770000,18.030000,21.150000",
  "",
].join("\r\n");

describe("Cboe VIX parsing", () => {
  it("converts US Eastern wall time to UTC across daylight saving", () => {
    expect(easternToIso("2026-11-02T16:15:01")).toBe("2026-11-02T21:15:01.000Z"); // EST (UTC-5)
    expect(easternToIso("2026-07-01T16:15:00")).toBe("2026-07-01T20:15:00.000Z"); // EDT (UTC-4)
    expect(easternToIso("bad")).toBeNull();
  });

  it("reads the delayed quote with change in points and as a rate", () => {
    const quote = parseVixQuote(QUOTE);

    expect(quote.changeRate).toBeCloseTo(0.081797);
    expect(quote).toEqual({
      value: 21.15,
      change: 1.73,
      changeRate: quote.changeRate,
      open: 19.05,
      high: 21.77,
      low: 18.03,
      timestamp: "2026-11-02T21:15:01.000Z",
    });
  });

  it("rejects a quote without a price", () => {
    expect(() => parseVixQuote({ data: {} })).toThrow(/형식/);
  });

  it("reads the daily history oldest first, dated at KST midnight of the US trading day", () => {
    const rows = parseVixHistory(CSV);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ time: "2026-10-29T00:00:00+09:00", open: 18.1, high: 19.2, low: 17.9, close: 18.5, volume: 0 });
    expect(rows.at(-1)?.close).toBe(21.15);
    expect(parseVixHistory(CSV, 2).map((r) => r.close)).toEqual([19.42, 21.15]);
  });
});

describe("createCboeClient", () => {
  function setup(handler: (path: string) => Response | Promise<Response>) {
    const calls: string[] = [];
    const client = createCboeClient({
      baseUrl: "https://cboe.test/api/global/",
      fetch: (async (input: string | URL | Request) => {
        const path = new URL(String(input)).pathname.replace("/api/global", "");
        calls.push(path);
        return handler(path);
      }) as typeof fetch,
    });
    return { client, calls };
  }

  it("fetches the quote and history once within the cache window", async () => {
    const t = setup((path) =>
      path.endsWith("_VIX.json") ? Response.json(QUOTE) : new Response(CSV, { headers: { "Content-Type": "text/csv" } })
    );

    await t.client.getVixQuote();
    await t.client.getVixQuote();
    await t.client.getVixHistory();
    await t.client.getVixHistory();

    expect(t.calls).toEqual(["/delayed_quotes/quotes/_VIX.json", "/us_indices/daily_prices/VIX_History.csv"]);
  });

  it("turns Cboe failures into 503", async () => {
    const t = setup(() => new Response("blocked", { status: 403 }));
    await expect(t.client.getVixQuote()).rejects.toMatchObject({ status: 503, code: "CBOE_ERROR" });

    const down = createCboeClient({
      baseUrl: "https://cboe.test",
      fetch: (async () => {
        throw new Error("ECONNRESET");
      }) as typeof fetch,
    });
    await expect(down.getVixHistory()).rejects.toMatchObject({ status: 503, code: "CBOE_UNREACHABLE" });
  });
});
