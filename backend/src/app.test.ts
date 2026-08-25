import { describe, it, expect } from "vitest";
import request from "supertest";

import { createApp } from "./app.js";

/**
 * 기존 `BackendApplicationTests.contextLoads()` 대응 smoke test.
 * 앱이 외부 의존(MySQL/Redis/Google) 없이 조립되는지 확인한다.
 */
describe("app", () => {
  const app = createApp();

  it("creates the express app without external dependencies", () => {
    expect(app).toBeDefined();
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
