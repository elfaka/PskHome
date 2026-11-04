import { describe, it, expect } from "vitest";
import request from "supertest";

import { createApp } from "../../app.js";

/**
 * 인증 라우터 계약 테스트.
 *
 * 실제 Google 로그인 플로우는 외부 의존이라 여기서 검증하지 않는다.
 * "프론트가 의존하는 계약"만 확인한다:
 * - /api/auth/me 는 비로그인 상태에서도 200 이어야 한다 (401 이면 로그인 화면이 안 뜬다)
 * - /api/auth/logout 은 세션이 없어도 200 이어야 한다
 * - OAuth2 시작 경로가 기존과 동일해야 한다
 */
describe("auth routes", () => {
  const app = createApp();

  it("GET /api/auth/me returns authenticated:false when not logged in", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authenticated: false });
  });

  it("POST /api/auth/logout returns 200 even without a session", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(200);
  });

  it("keeps the legacy OAuth2 start path mounted", async () => {
    const res = await request(app).get("/api/oauth2/authorization/google");

    // 라우트가 존재해야 한다. (설정 여부에 따라 302 리다이렉트 또는 503)
    expect(res.status).not.toBe(404);
    expect([302, 503]).toContain(res.status);
  });

  it("keeps the legacy OAuth2 callback path mounted", async () => {
    const res = await request(app).get("/api/login/oauth2/code/google");

    expect(res.status).not.toBe(404);
  });
});
