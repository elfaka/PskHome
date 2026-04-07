import { describe, it, expect } from "vitest";
import { listPosts, getPost, createPost, deletePost } from "./pspost";

describe("pspost API functions", () => {
  it("listPosts returns a page object with correct shape", async () => {
    const result = await listPosts(0, 10);
    expect(result.content).toBeInstanceOf(Array);
    expect(result).toHaveProperty("totalElements");
    expect(result).toHaveProperty("totalPages");
    expect(result).toHaveProperty("first");
    expect(result).toHaveProperty("last");
    expect(result).toHaveProperty("empty");
  });

  it("listPosts content items have PsPost shape", async () => {
    const result = await listPosts(0, 10);
    const post = result.content[0];
    expect(post).toHaveProperty("id");
    expect(post).toHaveProperty("title");
    expect(post).toHaveProperty("site");
    expect(post).toHaveProperty("isSolved");
  });

  it("getPost returns a post with correct id", async () => {
    const post = await getPost(1);
    expect(post.id).toBe(1);
    expect(post).toHaveProperty("title");
    expect(post).toHaveProperty("site");
    expect(post).toHaveProperty("isSolved");
  });

  it("createPost returns a numeric id", async () => {
    const id = await createPost({
      title: "테스트",
      site: "BOJ",
      problemNumber: "1001",
      link: "https://boj.kr/1001",
      level: "Silver",
      language: "Java",
      solution: "A + B",
      contentMd: "# 두 수의 합",
    });
    expect(typeof id).toBe("number");
  });

  it("deletePost resolves without error", async () => {
    await expect(deletePost(1)).resolves.toBeUndefined();
  });
});
