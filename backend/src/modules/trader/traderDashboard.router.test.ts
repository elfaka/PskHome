import { describe, expect, it, vi } from "vitest";
import request from "supertest";

/**
 * 대시보드 API 인증 경계와 응답 계약.
 * DB 는 쓰지 않는다 — 서비스 모듈을 가짜로 바꾼다.
 */

const PASSWORD = "test-only password 123";

const accountReady = vi.hoisted(async () => {
  const { randomBytes, scryptSync } = await import("node:crypto");
  const salt = randomBytes(16);
  const key = scryptSync("test-only password 123", salt, 64, { N: 16384, r: 8, p: 1 });
  process.env.TRADER_ADMIN_USERNAME = "owner";
  process.env.TRADER_ADMIN_PASSWORD_HASH = ["scrypt", 16384, 8, 1, salt.toString("base64"), key.toString("base64")].join(":");
});

const calls = vi.hoisted(() => ({ list: [] as unknown[][] }));

vi.mock("./traderDashboard.service.js", () => ({
  clampLimit: (raw: unknown, fallback = 50) => {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 ? Math.min(n, 200) : fallback;
  },
  getSummary: async (name: string) => {
    calls.list.push(["summary", name]);
    return { account: { name }, cash: "9124526.0000", positions: [], killswitch: { halted: false } };
  },
  listOrders: async (name: string, limit: number) => {
    calls.list.push(["orders", name, limit]);
    return [{ clientOrderId: "c1", qty: "13.000000" }];
  },
  listFills: async () => [],
  listDecisions: async (limit: number, opts: unknown) => {
    calls.list.push(["decisions", limit, opts]);
    return [];
  },
  getPerformance: async () => [],
  listRiskEvents: async (limit: number) => {
    calls.list.push(["risk", limit]);
    return [];
  },
}));

await accountReady;
const { createApp } = await import("../../app.js");

const ROUTES = ["/summary", "/orders", "/fills", "/decisions", "/performance", "/risk-events"];

async function loggedIn() {
  const agent = request.agent(createApp());
  const res = await agent.post("/api/trader/auth/login").send({ username: "owner", password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

describe("trader dashboard routes", () => {
  it.each(ROUTES)("GET /api/trader%s needs trader login", async (path) => {
    const res = await request(createApp()).get(`/api/trader${path}`);
    expect(res.status).toBe(401);
  });

  it("returns dashboard data after login with no-store / noindex headers", async () => {
    const agent = await loggedIn();
    const res = await agent.get("/api/trader/summary");
    expect(res.status).toBe(200);
    expect(res.body.cash).toBe("9124526.0000"); // 금액은 문자열 그대로
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
    for (const path of ROUTES) {
      expect((await agent.get(`/api/trader${path}`)).status).toBe(200);
    }
  });

  it("uses the configured account and clamps limits and filters", async () => {
    calls.list = [];
    const agent = await loggedIn();
    await agent.get("/api/trader/orders?limit=9999");
    await agent.get("/api/trader/decisions?limit=abc&strategy=intraday_score&signals=1");
    await agent.get("/api/trader/decisions?strategy=DROP%20TABLE");
    await agent.get("/api/trader/risk-events");
    expect(calls.list).toEqual([
      ["orders", "paper-default", 200],
      ["decisions", 50, { strategy: "intraday_score", signalsOnly: true }],
      ["decisions", 50, { strategy: undefined, signalsOnly: false }],
      ["risk", 30],
    ]);
  });

  it("does not expose any write route", async () => {
    const agent = await loggedIn();
    for (const path of ["/orders", "/killswitch", "/summary"]) {
      expect((await agent.post(`/api/trader${path}`).send({})).status).toBe(404);
    }
  });
});
