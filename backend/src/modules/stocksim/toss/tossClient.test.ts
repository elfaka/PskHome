import { describe, it, expect } from "vitest";

import { createTossClient } from "./tossClient.js";

/**
 * 토스 API 를 실제로 부르지 않고 fetch 를 바꿔 끼워 토큰 캐시·재발급 규칙을 검증한다.
 */

interface Call {
  url: string;
  init?: RequestInit;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tokenResponse(token: string, expiresIn = 3600): Response {
  return json(200, { access_token: token, token_type: "Bearer", expires_in: expiresIn });
}

function priceResponse(symbol = "005930"): Response {
  return json(200, {
    result: [{ symbol, timestamp: "2026-10-30T10:00:00+09:00", lastPrice: "70000", currency: "KRW" }],
  });
}

function setup(handler: (call: Call, calls: Call[]) => Response | Promise<Response>) {
  const calls: Call[] = [];
  let clock = 0;

  const client = createTossClient({
    baseUrl: "https://toss.test/",
    clientId: "id",
    clientSecret: "secret",
    now: () => clock,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(input), init };
      calls.push(call);
      return handler(call, calls);
    }) as typeof fetch,
  });

  return {
    client,
    calls,
    advance(ms: number) {
      clock += ms;
    },
    tokenCalls: () => calls.filter((c) => c.url.endsWith("/oauth2/token")),
  };
}

describe("createTossClient", () => {
  it("issues a token with the client credentials form body and sends it as Bearer", async () => {
    const t = setup((call) => (call.url.endsWith("/oauth2/token") ? tokenResponse("tok-1") : priceResponse()));

    const prices = await t.client.getPrices(["005930", "000660"]);

    expect(prices[0].lastPrice).toBe("70000");

    const [tokenCall, priceCall] = t.calls;
    expect(tokenCall.url).toBe("https://toss.test/oauth2/token");
    expect(tokenCall.init?.method).toBe("POST");
    const form = new URLSearchParams(String(tokenCall.init?.body));
    expect(form.get("grant_type")).toBe("client_credentials");
    expect(form.get("client_id")).toBe("id");
    expect(form.get("client_secret")).toBe("secret");

    expect(priceCall.url).toBe("https://toss.test/api/v1/prices?symbols=005930%2C000660");
    expect((priceCall.init?.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
  });

  it("reuses the cached token until shortly before it expires", async () => {
    let issued = 0;
    const t = setup((call) =>
      call.url.endsWith("/oauth2/token") ? tokenResponse(`tok-${++issued}`, 600) : priceResponse()
    );

    await t.client.getPrices(["005930"]);
    t.advance(500_000); // 남은 100초 > 갱신 여유 60초
    await t.client.getPrices(["005930"]);
    expect(t.tokenCalls()).toHaveLength(1);

    t.advance(50_000); // 남은 50초 < 갱신 여유 60초
    await t.client.getPrices(["005930"]);
    expect(t.tokenCalls()).toHaveLength(2);
  });

  it("issues only one token for concurrent requests", async () => {
    const t = setup(async (call) => {
      if (call.url.endsWith("/oauth2/token")) {
        await new Promise((r) => setTimeout(r, 5));
        return tokenResponse("tok-1");
      }
      return priceResponse();
    });

    await Promise.all([
      t.client.getPrices(["005930"]),
      t.client.getPrices(["000660"]),
      t.client.getStocks(["005930"]).catch(() => null),
    ]);

    expect(t.tokenCalls()).toHaveLength(1);
  });

  it("re-issues the token once when the API rejects it as expired", async () => {
    let issued = 0;
    const t = setup((call) => {
      if (call.url.endsWith("/oauth2/token")) return tokenResponse(`tok-${++issued}`);
      const auth = (call.init?.headers as Record<string, string>).Authorization;
      return auth === "Bearer tok-1"
        ? json(401, { error: { code: "expired-token", message: "만료" } })
        : priceResponse();
    });

    const prices = await t.client.getPrices(["005930"]);

    expect(prices).toHaveLength(1);
    expect(t.tokenCalls()).toHaveLength(2);
  });

  it("re-issues the token when another process revoked it", async () => {
    let issued = 0;
    const t = setup((call) => {
      if (call.url.endsWith("/oauth2/token")) return tokenResponse(`tok-${++issued}`);
      const auth = (call.init?.headers as Record<string, string>).Authorization;
      return auth === "Bearer tok-1"
        ? json(401, { error: { code: "token-revoked", message: "새로 발급된 토큰으로 대체" } })
        : priceResponse();
    });

    await t.client.getPrices(["005930"]);
    t.advance(1_000);
    // 이후 요청은 새 토큰을 그대로 쓴다.
    await t.client.getPrices(["005930"]);

    expect(t.tokenCalls()).toHaveLength(2);
  });

  it("re-issues only once when concurrent requests all hit a revoked token", async () => {
    let issued = 0;
    let revoked = false;
    const t = setup(async (call) => {
      if (call.url.endsWith("/oauth2/token")) {
        await new Promise((r) => setTimeout(r, 5));
        return tokenResponse(`tok-${++issued}`);
      }
      const auth = (call.init?.headers as Record<string, string>).Authorization;
      return revoked && auth === "Bearer tok-1"
        ? json(401, { error: { code: "token-revoked", message: "무효화" } })
        : priceResponse();
    });

    await t.client.getPrices(["005930"]);
    revoked = true; // 로컬 서버가 같은 키로 재발급한 상황

    const results = await Promise.all([
      t.client.getPrices(["005930"]),
      t.client.getPrices(["000660"]),
      t.client.getPrices(["035720"]),
    ]);

    expect(results.every((r) => r.length === 1)).toBe(true);
    expect(t.tokenCalls()).toHaveLength(2);
  });

  it("calls the market indicator endpoints with an encoded before cursor", async () => {
    const t = setup((call) =>
      call.url.endsWith("/oauth2/token") ? tokenResponse("tok") : json(200, { result: { candles: [], nextBefore: null } })
    );

    await t.client.getIndicatorCandles("KOSPI", "1d", 200, "2026-06-10T09:00:00+09:00");
    await t.client.getMarketInvestorTrading("KOSDAQ", 20);

    const [candles, investors] = t.calls.filter((c) => !c.url.endsWith("/oauth2/token"));
    expect(candles.url).toBe(
      "https://toss.test/api/v1/market-indicators/KOSPI/candles?interval=1d&count=200&before=2026-06-10T09%3A00%3A00%2B09%3A00"
    );
    expect(investors.url).toBe("https://toss.test/api/v1/market-indicators/KOSDAQ/investor-trading?interval=1d&count=20");
  });

  it("gives up after one retry when the token keeps being rejected", async () => {
    const t = setup((call) =>
      call.url.endsWith("/oauth2/token")
        ? tokenResponse("tok")
        : json(401, { error: { code: "invalid-token", message: "무효" } })
    );

    await expect(t.client.getPrices(["005930"])).rejects.toMatchObject({ status: 503 });
    expect(t.tokenCalls()).toHaveLength(2);
  });

  it("maps a 403 on token issuance to TOSS_IP_NOT_ALLOWED", async () => {
    const t = setup(() => json(403, { error: "access_denied", error_description: "IP address not allowed" }));

    await expect(t.client.getPrices(["005930"])).rejects.toMatchObject({
      status: 503,
      code: "TOSS_IP_NOT_ALLOWED",
    });
  });

  it("maps a 401 on token issuance to TOSS_AUTH_FAILED", async () => {
    const t = setup(() => json(401, { error: "invalid_client" }));

    await expect(t.client.getPrices(["005930"])).rejects.toMatchObject({ code: "TOSS_AUTH_FAILED" });
  });

  it("maps 429 to 503 TOSS_RATE_LIMITED", async () => {
    const t = setup((call) =>
      call.url.endsWith("/oauth2/token")
        ? tokenResponse("tok")
        : json(429, { error: { code: "rate-limit-exceeded", message: "too many" } })
    );

    await expect(t.client.getPrices(["005930"])).rejects.toMatchObject({
      status: 503,
      code: "TOSS_RATE_LIMITED",
    });
  });

  it("passes a 400 from the API through as a client error", async () => {
    const t = setup((call) =>
      call.url.endsWith("/oauth2/token")
        ? tokenResponse("tok")
        : json(400, { error: { code: "invalid-request", message: "잘못된 심볼" } })
    );

    await expect(t.client.getCandles("???", "1d", 10)).rejects.toMatchObject({
      status: 400,
      code: "TOSS_REQUEST_REJECTED",
      message: "잘못된 심볼",
    });
  });

  it("maps a network failure to TOSS_UNREACHABLE", async () => {
    const t = setup(() => {
      throw new TypeError("fetch failed");
    });

    await expect(t.client.getPrices(["005930"])).rejects.toMatchObject({ code: "TOSS_UNREACHABLE" });
  });

  it("only exposes read-only market data calls", () => {
    const t = setup(() => tokenResponse("tok"));

    expect(Object.keys(t.client).sort()).toEqual([
      "getAllStocks",
      "getCandles",
      "getIndicatorCandles",
      "getIndicatorPrices",
      "getInvestorTrading",
      "getMarketInvestorTrading",
      "getOrderbook",
      "getPriceLimits",
      "getPrices",
      "getShortSelling",
      "getStocks",
      "getTrades",
    ]);
  });
});
