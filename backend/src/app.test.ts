import { describe, it, expect } from "vitest";
import request from "supertest";

import { createApp } from "./app.js";
import { isTest } from "./config/env.js";

/**
 * 기존 `BackendApplicationTests.contextLoads()` 대응 smoke test.
 * 앱이 외부 의존(MySQL/Google) 없이 조립되는지 확인한다.
 */
describe("app", () => {
  const app = createApp();

  it("creates the express app without external dependencies", () => {
    expect(app).toBeDefined();
  });

  /**
   * 쿠키의 secure 플래그 등 환경에 따라 갈리는 동작이 있으므로
   * 테스트가 항상 test 프로파일로 도는지 확인한다.
   * (.env 의 NODE_ENV=development 가 새어들어오면 안 된다)
   */
  it("runs with NODE_ENV=test", () => {
    expect(isTest).toBe(true);
  });

  it("GET /api/ping returns 200 with ok:true", async () => {
    const res = await request(app).get("/api/ping");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("returns 404 JSON for unknown routes", async () => {
    const res = await request(app).get("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
