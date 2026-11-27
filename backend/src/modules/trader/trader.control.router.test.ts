import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

/**
 * 2단계 인증(TOTP) + 조작 API 계약.
 * - 로그인에 코드 필요, 같은 코드 재사용 불가
 * - 긴급 정지·전략 끄기는 코드 없이, 재개·전략 켜기·설정 변경은 코드 확인 후 5분 안에만
 * - 조작은 같은 출처의 JSON 요청만
 */

const PASSWORD = "test-only password 123";
const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

const ready = vi.hoisted(async () => {
  const { randomBytes, scryptSync } = await import("node:crypto");
  const salt = randomBytes(16);
  const key = scryptSync("test-only password 123", salt, 64, { N: 16384, r: 8, p: 1 });
  process.env.TRADER_ADMIN_USERNAME = "owner";
  process.env.TRADER_ADMIN_PASSWORD_HASH = ["scrypt", 16384, 8, 1, salt.toString("base64"), key.toString("base64")].join(":");
  process.env.TRADER_TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  // 운영 공개 주소 (Cloudflare → traefik 뒤에서 Host 가 바뀌어도 이 출처는 받아야 한다)
  process.env.GOOGLE_CALLBACK_URL = "https://elfaka.kr/api/login/oauth2/code/google";
});

const calls = vi.hoisted(() => ({ list: [] as unknown[][] }));

vi.mock("./traderControl.service.js", () => ({
  halt: async (reason: string, by: string) => void calls.list.push(["halt", reason, by]),
  resume: async (by: string) => void calls.list.push(["resume", by]),
  setStrategy: async (id: string, enabled: boolean, by: string) => void calls.list.push(["strategy", id, enabled, by]),
  updateSettings: async (values: unknown, by: string) => {
    calls.list.push(["settings", values, by]);
    return { version: 1, values };
  },
  revertSettings: async (by: string) => {
    calls.list.push(["revert", by]);
    return { version: 2, values: {}, restored: 1 };
  },
}));

await ready;
const { createApp } = await import("../../app.js");
const { hotp, stepAt, base32Decode } = await import("./totp.js");

const KEY = base32Decode(SECRET)!;
const ORIGIN = "http://localhost:5173";
let clock = Date.now();

function codeAt(ms: number) {
  return hotp(KEY, stepAt(ms));
}

/** 매 로그인마다 다른 스텝의 코드를 쓰도록 시계를 30초씩 민다 (재사용 방지 때문) */
async function login() {
  clock += 30_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  const agent = request.agent(createApp());
  const res = await agent.post("/api/trader/auth/login").send({ username: "owner", password: PASSWORD, code: codeAt(clock) });
  expect(res.status).toBe(200);
  return agent;
}

afterEach(() => {
  calls.list = [];
  vi.restoreAllMocks();
});

describe("trader 2FA and control routes", () => {
  it("me tells the login form that a code is required", async () => {
    const res = await request(createApp()).get("/api/trader/auth/me");
    expect(res.body).toEqual({ authenticated: false, totpRequired: true });
  });

  it("login needs the code; a wrong or reused code fails like a wrong password", async () => {
    clock += 30_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const app = createApp();
    const noCode = await request(app).post("/api/trader/auth/login").send({ username: "owner", password: PASSWORD });
    expect(noCode.status).toBe(401);
    expect(noCode.body.error.code).toBe("LOGIN_FAILED");

    const code = codeAt(clock);
    const ok = await request(app).post("/api/trader/auth/login").send({ username: "owner", password: PASSWORD, code });
    expect(ok.status).toBe(200);
    const replay = await request(app).post("/api/trader/auth/login").send({ username: "owner", password: PASSWORD, code });
    expect(replay.status).toBe(401);
  });

  it("login counts as step-up for 5 minutes", async () => {
    const agent = await login();
    const me = await agent.get("/api/trader/auth/me");
    expect(me.body).toMatchObject({ authenticated: true, totpEnabled: true });
    expect(new Date(me.body.stepUpUntil).getTime()).toBe(clock + 5 * 60_000);

    const ok = await agent.post("/api/trader/control/resume").set("Origin", ORIGIN).send({ note: "확인" });
    expect(ok.status).toBe(200);
    expect(calls.list).toEqual([["resume", "web:owner"]]);
  });

  it("after 5 minutes risky actions need a fresh code; halt and off never do", async () => {
    const agent = await login();
    clock += 6 * 60_000;

    const resume = await agent.post("/api/trader/control/resume").set("Origin", ORIGIN).send({});
    expect(resume.status).toBe(403);
    expect(resume.body.error.code).toBe("STEP_UP_REQUIRED");
    const on = await agent.post("/api/trader/control/strategies/ma_cross").set("Origin", ORIGIN).send({ enabled: true });
    expect(on.status).toBe(403);
    const put = await agent.put("/api/trader/control/settings").set("Origin", ORIGIN).send({ values: { slippage_bps: "6" } });
    expect(put.status).toBe(403);

    const halt = await agent.post("/api/trader/control/halt").set("Origin", ORIGIN).send({ reason: "점검" });
    expect(halt.status).toBe(200);
    const off = await agent.post("/api/trader/control/strategies/ma_cross").set("Origin", ORIGIN).send({ enabled: false });
    expect(off.status).toBe(200);
    expect(calls.list).toEqual([
      ["halt", "점검", "web:owner"],
      ["strategy", "ma_cross", false, "web:owner"],
    ]);

    const bad = await agent.post("/api/trader/auth/step-up").set("Origin", ORIGIN).send({ code: "000000" });
    expect(bad.status).toBe(401);
    const step = await agent.post("/api/trader/auth/step-up").set("Origin", ORIGIN).send({ code: codeAt(clock) });
    expect(step.status).toBe(200);
    const put2 = await agent.put("/api/trader/control/settings").set("Origin", ORIGIN).send({ values: { slippage_bps: "6" } });
    expect(put2.status).toBe(200);
    expect(calls.list.at(-1)).toEqual(["settings", { slippage_bps: "6" }, "web:owner"]);
    // 되돌리기도 같은 보호 — 지금은 step-up 안이라 통과
    const rev = await agent.post("/api/trader/control/settings/revert").set("Origin", ORIGIN).send({});
    expect(rev.status).toBe(200);
    expect(calls.list.at(-1)).toEqual(["revert", "web:owner"]);
  });

  it("rejects control requests from another origin or without JSON", async () => {
    const agent = await login();
    const foreign = await agent.post("/api/trader/control/halt").set("Origin", "https://evil.example").send({});
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe("BAD_ORIGIN");
    const none = await agent.post("/api/trader/control/halt").send({});
    expect(none.status).toBe(403);
    const form = await agent
      .post("/api/trader/control/halt")
      .set("Origin", ORIGIN)
      .type("form")
      .send("reason=x");
    expect(form.status).toBe(403);
    expect(calls.list).toEqual([]);
  });

  it("accepts the public origin even when the proxy rewrites Host (production: Cloudflare → traefik)", async () => {
    const agent = await login();
    // 백엔드가 받은 Host 는 내부 주소, 브라우저 Origin 은 공개 주소
    const viaProxy = await agent
      .post("/api/trader/control/halt")
      .set("Host", "pskhome-be-1:8080")
      .set("Origin", "https://elfaka.kr")
      .send({ reason: "proxy" });
    expect(viaProxy.status).toBe(200);
    // 프록시가 원래 Host 를 X-Forwarded-Host 로 넘기는 경우
    const forwarded = await agent
      .post("/api/trader/control/halt")
      .set("Host", "pskhome-be-1:8080")
      .set("X-Forwarded-Host", "trader.example.kr")
      .set("X-Forwarded-Proto", "https")
      .set("Origin", "https://trader.example.kr")
      .send({ reason: "forwarded" });
    expect(forwarded.status).toBe(200);
    // 다른 사이트는 여전히 막는다
    const evil = await agent.post("/api/trader/control/halt").set("Origin", "https://elfaka.kr.evil.example").send({});
    expect(evil.status).toBe(403);
    expect(evil.body.error.message).toContain("다른 주소");
    expect(calls.list).toEqual([
      ["halt", "proxy", "web:owner"],
      ["halt", "forwarded", "web:owner"],
    ]);
  });

  it("control routes require trader login", async () => {
    const res = await request(createApp()).post("/api/trader/control/halt").set("Origin", ORIGIN).send({});
    expect(res.status).toBe(401);
  });
});
