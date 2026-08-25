import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

import { createFakePrisma } from "../../testing/fakePrisma.js";

/**
 * 기존 `PsPostControllerTest.java` (MockMvc + H2) 이식.
 * H2 인메모리 DB → 인메모리 fake Prisma client 로, 실제 저장/조회까지 도는 통합 테스트를 유지한다.
 */
const holder = vi.hoisted(() => ({ prisma: null as unknown }));

vi.mock("../../lib/prisma.js", () => ({
  getPrisma: () => holder.prisma,
  disconnectPrisma: async () => {},
}));

const { createApp } = await import("../../app.js");

const app = createApp();

const testPost = {
  title: "테스트 제목",
  site: "BOJ",
  problemNumber: "1001",
  link: "https://boj.kr/1001",
  level: "Silver",
  language: "Java",
  solution: "A + B",
  contentMd: "# 두 수의 합",
};

async function createTestPost(): Promise<number> {
  const res = await request(app).post("/api/posts").send(testPost);

  expect(res.status).toBe(200);
  return res.body as number;
}

describe("pspost routes", () => {
  beforeEach(() => {
    holder.prisma = createFakePrisma();
  });

  it("GET /api/posts returns 200 with the page structure", async () => {
    const res = await request(app).get("/api/posts?page=0&size=10");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.content)).toBe(true);
    expect(res.body).toHaveProperty("totalElements");
    expect(res.body).toHaveProperty("totalPages");
    expect(res.body).toHaveProperty("number");
    expect(res.body).toHaveProperty("size");
    expect(res.body).toHaveProperty("first");
    expect(res.body).toHaveProperty("last");
    expect(res.body).toHaveProperty("empty");
  });

  it("GET /api/posts defaults to page=0 size=10", async () => {
    const res = await request(app).get("/api/posts");

    expect(res.status).toBe(200);
    expect(res.body.number).toBe(0);
    expect(res.body.size).toBe(10);
  });

  it("POST /api/posts returns 200 with a raw numeric id", async () => {
    const res = await request(app).post("/api/posts").send({
      title: "새 게시글",
      site: "Programmers",
      problemNumber: "42587",
      link: "https://programmers.co.kr/42587",
      level: "Level2",
      language: "Java",
      solution: "queue",
      contentMd: "# 프린터",
    });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/^\d+$/);
    expect(typeof res.body).toBe("number");
  });

  it("GET /api/posts/:id returns 200 after creating a post", async () => {
    const id = await createTestPost();

    const res = await request(app).get(`/api/posts/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.site).toBe("BOJ");
    expect(typeof res.body.createdAt).toBe("string");
    expect(Number.isNaN(new Date(res.body.createdAt).getTime())).toBe(false);
  });

  it("GET /api/posts/:id returns 404 for a missing post", async () => {
    const res = await request(app).get("/api/posts/999");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("GET /api/posts/:id returns 400 for a non-numeric id", async () => {
    const res = await request(app).get("/api/posts/abc");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ID");
  });

  it("PUT /api/posts/:id returns 200 with the same id", async () => {
    const id = await createTestPost();

    const res = await request(app)
      .put(`/api/posts/${id}`)
      .send({
        title: "수정된 제목",
        site: "BOJ",
        problemNumber: "1001",
        link: "https://boj.kr/1001",
        level: "Gold",
        language: "Kotlin",
        solution: "updated",
        contentMd: "# updated",
      });

    expect(res.status).toBe(200);
    expect(res.body).toBe(id);

    const after = await request(app).get(`/api/posts/${id}`);
    expect(after.body.title).toBe("수정된 제목");
    expect(after.body.level).toBe("Gold");
  });

  it("DELETE /api/posts/:id returns 200", async () => {
    const id = await createTestPost();

    const res = await request(app).delete(`/api/posts/${id}`);

    expect(res.status).toBe(200);

    const after = await request(app).get(`/api/posts/${id}`);
    expect(after.status).toBe(404);
  });
});
