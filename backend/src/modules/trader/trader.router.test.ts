import { describe, expect, it, vi } from "vitest";
import request from "supertest";

/**
 * /api/trader 인증 경계 계약.
 * - login/logout/me 만 공개, me 는 비로그인에도 200
 * - 그 외 /api/trader/** 는 trader 로그인 필요 (Google 로그인으로는 통과 못 함)
 * - 실패 메시지는 하나로 통일, 반복 실패는 429
 */

const PASSWORD = "test-only password 123";

// env 는 import 시점에 읽히므로 그 전에 테스트 계정을 심는다
const accountReady = vi.hoisted(async () => {
  const { randomBytes, scryptSync } = await import("node:crypto");
  const salt = randomBytes(16);
  const key = scryptSync("test-only password 123", salt, 64, { N: 16384, r: 8, p: 1 });
  process.env.TRADER_ADMIN_USERNAME = "owner";
  process.env.TRADER_ADMIN_PASSWORD_HASH = [
    "scrypt", 16384, 8, 1, salt.toString("base64"), key.toString("base64"),
  ].join(":");
});

await accountReady;
const { createApp } = await import("../../app.js");

describe("trader routes", () => {
  it("GET /api/trader/auth/me is public and says not authenticated", async () => {
    const res = await request(createApp()).get("/api/trader/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authenticated: false, totpRequired: false });
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("protected routes return 401 without trader login", async () => {
    const res = await request(createApp()).get("/api/trader/ping");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("wrong username and wrong password get the same 401 message", async () => {
    const app = createApp();
    const a = await request(app)
      .post("/api/trader/auth/login")
      .send({ username: "owner", password: "nope" });
    const b = await request(app)
      .post("/api/trader/auth/login")
      .send({ username: "someone", password: PASSWORD });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it("logs in, rotates the session id, reaches protected routes, logs out", async () => {
    const agent = request.agent(createApp());
    // 로그인 전에 쿠키가 생기도록 다른 기능으로 세션을 만든다 (세션 고정 시나리오)
    const before = await agent
      .post("/api/trader/auth/login")
      .send({ username: "owner", password: "wrong" });
    const cookieBefore = before.headers["set-cookie"];

    const login = await agent
      .post("/api/trader/auth/login")
      .send({ username: "owner", password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body).toEqual({ authenticated: true, username: "owner" });
    const cookieAfter = login.headers["set-cookie"];
    expect(cookieAfter).toBeDefined();
    expect(cookieAfter).not.toEqual(cookieBefore);

    expect((await agent.get("/api/trader/auth/me")).body).toEqual({
      authenticated: true,
      username: "owner",
      totpEnabled: false,
      stepUpUntil: null,
    });
    expect((await agent.get("/api/trader/ping")).status).toBe(200);

    expect((await agent.post("/api/trader/auth/logout")).status).toBe(200);
    expect((await agent.get("/api/trader/ping")).status).toBe(401);
    expect((await agent.get("/api/trader/auth/me")).body).toEqual({ authenticated: false, totpRequired: false });
  });

  it("rejects malformed bodies with the same 401", async () => {
    const res = await request(createApp()).post("/api/trader/auth/login").send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("LOGIN_FAILED");
  });

  it("throttles repeated failures with 429 even for the right password", async () => {
    const app = createApp();
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/trader/auth/login").send({ username: "owner", password: "x" });
    }
    const res = await request(app)
      .post("/api/trader/auth/login")
      .send({ username: "owner", password: PASSWORD });
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("does not touch the Google auth contract", async () => {
    const res = await request(createApp()).get("/api/auth/me");
    expect(res.body).toEqual({ authenticated: false });
  });
});
