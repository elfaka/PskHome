import { describe, expect, it, vi } from "vitest";
import request from "supertest";

/**
 * 그래프·지표 API — 인증 경계와 입력 검증. DB 는 쓰지 않는다 (서비스를 가짜로 바꾼다).
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

vi.mock("./traderCharts.service.js", async () => {
  const real = await vi.importActual<typeof import("./traderCharts.service.js")>("./traderCharts.service.js");
  return {
    ...real,
    getChart: async (account: string, symbol: string, interval: number) => {
      calls.list.push(["chart", account, symbol, interval]);
      return { symbol, interval, bars: [] };
    },
    getScores: async (symbol: string) => {
      calls.list.push(["scores", symbol]);
      return { symbol, points: [] };
    },
    getStats: async (account: string) => {
      calls.list.push(["stats", account]);
      return { today: { costs: "0" } };
    },
  };
});

await accountReady;
const { createApp } = await import("../../app.js");

async function loggedIn() {
  const agent = request.agent(createApp());
  const res = await agent.post("/api/trader/auth/login").send({ username: "owner", password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

describe("trader chart routes", () => {
  it.each(["/chart?symbol=005930", "/scores?symbol=005930", "/stats"])("GET /api/trader%s needs trader login", async (path) => {
    const res = await request(createApp()).get(`/api/trader${path}`);
    expect(res.status).toBe(401);
  });

  it("passes the account, symbol and interval through", async () => {
    calls.list = [];
    const agent = await loggedIn();
    expect((await agent.get("/api/trader/chart?symbol=005930")).status).toBe(200);
    expect((await agent.get("/api/trader/chart?symbol=000660&interval=300")).status).toBe(200);
    expect((await agent.get("/api/trader/scores?symbol=005930")).status).toBe(200);
    const stats = await agent.get("/api/trader/stats");
    expect(stats.status).toBe(200);
    expect(stats.headers["cache-control"]).toBe("no-store");
    expect(calls.list).toEqual([
      ["chart", "paper-default", "005930", 60],
      ["chart", "paper-default", "000660", 300],
      ["scores", "005930"],
      ["stats", "paper-default"],
    ]);
  });

  it("rejects bad symbols and intervals with 400", async () => {
    calls.list = [];
    const agent = await loggedIn();
    for (const path of [
      "/chart",
      "/chart?symbol=005930&interval=120",
      "/chart?symbol=00%27%3B%20DROP",
      "/chart?symbol=005930&symbol=000660",
      "/scores",
      "/scores?symbol=" + "A".repeat(17),
    ]) {
      const res = await agent.get(`/api/trader${path}`);
      expect(res.status, path).toBe(400);
      expect(res.body.error.code).toBe("BAD_REQUEST");
    }
    expect(calls.list).toEqual([]);
  });
});
