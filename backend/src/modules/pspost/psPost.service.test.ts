import { describe, it, expect, beforeEach, vi } from "vitest";

import { createFakePrisma, type FakePrisma } from "../../testing/fakePrisma.js";

/**
 * 기존 `PsPostServiceTest.java` (Mockito 단위 테스트) 이식.
 * Mockito mock repository → 인메모리 fake Prisma client.
 */
const holder = vi.hoisted(() => ({ prisma: null as unknown }));

vi.mock("../../lib/prisma.js", () => ({
  getPrisma: () => holder.prisma,
  disconnectPrisma: async () => {},
}));

const { createPost, deletePost, getPostById, getPosts, updatePost } =
  await import("./psPost.service.js");

const samplePayload = {
  title: "Test Title",
  site: "BOJ",
  problemNumber: "1001",
  link: "https://boj.kr/1001",
  level: "Silver",
  language: "Java",
  solution: "solution text",
  contentMd: "# content",
};

describe("psPost service", () => {
  let fake: FakePrisma;

  beforeEach(() => {
    fake = createFakePrisma();
    holder.prisma = fake;
  });

  it("createPost persists the row and returns its id", async () => {
    const id = await createPost(samplePayload);

    expect(id).toBe(1);
    expect(fake._rows).toHaveLength(1);
    expect(fake._rows[0].title).toBe("Test Title");
  });

  it("createPost always stores isSolved as true", async () => {
    await createPost({ ...samplePayload, isSolved: false });

    expect(fake._rows[0].isSolved).toBe(true);
  });

  it("getPostById returns the mapped dto when the row exists", async () => {
    const id = await createPost(samplePayload);

    const result = await getPostById(id);

    expect(result.title).toBe("Test Title");
    expect(result.site).toBe("BOJ");
    expect(result.isSolved).toBe(true);
    expect(typeof result.id).toBe("number");
  });

  it("getPostById throws a 404 when the row is missing", async () => {
    await expect(getPostById(999)).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining("999"),
    });
  });

  it("getPosts returns a Spring-style page", async () => {
    await createPost(samplePayload);

    const result = await getPosts(0, 10);

    expect(result.totalElements).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.number).toBe(0);
    expect(result.size).toBe(10);
    expect(result.first).toBe(true);
    expect(result.last).toBe(true);
    expect(result.empty).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].title).toBe("Test Title");
  });

  it("getPosts orders by createdAt descending", async () => {
    const first = await createPost({ ...samplePayload, title: "older" });
    const second = await createPost({ ...samplePayload, title: "newer" });

    // 같은 밀리초에 생성될 수 있으므로 생성 시각을 명시적으로 벌려 둔다.
    fake._rows[0].createdAt = new Date("2024-01-01T00:00:00.000Z");
    fake._rows[1].createdAt = new Date("2024-06-01T00:00:00.000Z");

    const result = await getPosts(0, 10);

    expect(result.content.map((p) => p.id)).toEqual([second, first]);
  });

  it("getPosts paginates and reports page metadata", async () => {
    for (let i = 0; i < 15; i++) {
      await createPost({ ...samplePayload, title: `post-${i}` });
    }

    const page1 = await getPosts(1, 10);

    expect(page1.totalElements).toBe(15);
    expect(page1.totalPages).toBe(2);
    expect(page1.content).toHaveLength(5);
    expect(page1.first).toBe(false);
    expect(page1.last).toBe(true);
  });

  it("getPosts reports an empty page when there are no rows", async () => {
    const result = await getPosts(0, 10);

    expect(result.empty).toBe(true);
    expect(result.totalElements).toBe(0);
    expect(result.content).toEqual([]);
  });

  it("updatePost throws a 404 when the row is missing", async () => {
    await expect(updatePost(999, samplePayload)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("updatePost updates the row and returns its id", async () => {
    const id = await createPost(samplePayload);

    const returned = await updatePost(id, {
      ...samplePayload,
      title: "수정된 제목",
      level: "Gold",
    });

    expect(returned).toBe(id);
    expect(fake._rows[0].title).toBe("수정된 제목");
    expect(fake._rows[0].level).toBe("Gold");
  });

  it("updatePost keeps the existing isSolved when the field is omitted", async () => {
    const id = await createPost(samplePayload);

    await updatePost(id, { ...samplePayload });

    expect(fake._rows[0].isSolved).toBe(true);
  });

  it("updatePost applies isSolved when the field is provided", async () => {
    const id = await createPost(samplePayload);

    await updatePost(id, { ...samplePayload, isSolved: false });

    expect(fake._rows[0].isSolved).toBe(false);
  });

  it("deletePost removes the row", async () => {
    const id = await createPost(samplePayload);

    await deletePost(id);

    expect(fake._rows).toHaveLength(0);
  });

  it("deletePost is a no-op for a missing id", async () => {
    await expect(deletePost(5)).resolves.toBeUndefined();
  });
});
