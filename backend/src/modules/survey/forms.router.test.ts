import { describe, it, expect } from "vitest";
import request from "supertest";

import { createApp } from "../../app.js";

/**
 * `/api/forms/**` 의 보안 경계 검증.
 * 기존 SecurityConfig 에서 authenticated() 대상이던 경로가 그대로 보호되는지 확인한다.
 */
describe("forms routes require authentication", () => {
  const app = createApp();

  const protectedPaths = [
    "/api/forms",
    "/api/forms/form-1",
    "/api/forms/form-1/responses",
    "/api/forms/form-1/analyze",
  ];

  for (const path of protectedPaths) {
    it(`rejects unauthenticated GET ${path} with 401`, async () => {
      const res = await request(app).get(path);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  }
});
