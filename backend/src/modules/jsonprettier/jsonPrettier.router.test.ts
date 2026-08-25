import { describe, it, expect } from "vitest";
import request from "supertest";

import { createApp } from "../../app.js";

/**
 * 기존 `JsonFormatControllerTest.java` 이식.
 * MockMvc → supertest, `@SpringBootTest` → createApp().
 */
describe("POST /api/json/format", () => {
  const app = createApp();

  it("returns 400 EMPTY_INPUT for empty input", async () => {
    const res = await request(app)
      .post("/api/json/format")
      .send({ input: "" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe("EMPTY_INPUT");
  });

  it("returns 400 INVALID_MODE for unsupported mode", async () => {
    const res = await request(app)
      .post("/api/json/format")
      .send({ input: '{"a":1}', mode: "invalid" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_MODE");
  });

  it("returns 400 INVALID_INDENT for unsupported indent", async () => {
    const res = await request(app)
      .post("/api/json/format")
      .send({ input: '{"a":1}', mode: "prettify", indent: 3 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INDENT");
  });

  it("returns 200 with formatted output for a valid prettify request", async () => {
    const res = await request(app)
      .post("/api/json/format")
      .send({ input: '{"a":1}', mode: "prettify" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mode).toBe("prettify");
    expect(res.body.formatted).toBeDefined();
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.inputLength).toBe('{"a":1}'.length);
    expect(res.body.stats.outputLength).toBe(res.body.formatted.length);
  });

  it("returns 200 for a valid minify request", async () => {
    const res = await request(app)
      .post("/api/json/format")
      .send({ input: '{\n  "a": 1\n}', mode: "minify" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.formatted).toBe('{"a":1}');
  });

  it("defaults to prettify when mode is omitted", async () => {
    const res = await request(app)
      .post("/api/json/format")
      .send({ input: '{"a":1}' });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("prettify");
  });

  it("returns 400 INVALID_JSON with position info for malformed json", async () => {
    const res = await request(app)
      .post("/api/json/format")
      .send({ input: "{invalid}", mode: "prettify" });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe("INVALID_JSON");
    expect(res.body.error.line).toBe(1);
  });
});

describe("GET /api/json/health", () => {
  const app = createApp();

  it("returns 200 with ok:true", async () => {
    const res = await request(app).get("/api/json/health");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
