import { describe, it, expect } from "vitest";
import request from "supertest";

import { createApp } from "../../app.js";

describe("character route", () => {
  const app = createApp();

  it("requires authentication", async () => {
    const res = await request(app).get("/api/character/테스트");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});
