import { Router } from "express";

import { HttpError } from "../../lib/httpError.js";
import * as psPostService from "./psPost.service.js";
import type { PsPostRequest } from "./psPost.types.js";

/**
 * PS 문제풀이 게시글 — 기존 `pspost/controller/PsPostController.java`
 *
 * 인증이 필요 없는 공개 API (`/api/posts/**`).
 * 컨트롤러는 얇게 유지하고 비즈니스 로직은 서비스에 위임한다.
 */
export const psPostRouter: Router = Router();

function parseId(raw: string): number {
  const id = Number(raw);

  if (!Number.isInteger(id) || id <= 0) {
    throw HttpError.badRequest(`Invalid post id: ${raw}`, "INVALID_ID");
  }

  return id;
}

function parsePagingParam(
  raw: unknown,
  fallback: number,
  name: string
): number {
  if (raw == null) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw HttpError.badRequest(`Invalid ${name}: ${String(raw)}`, "INVALID_PARAM");
  }

  return value;
}

// 게시글 등록 — 생성된 id 를 raw number 로 반환한다 (기존 계약)
psPostRouter.post("/posts", async (req, res) => {
  const id = await psPostService.createPost((req.body ?? {}) as PsPostRequest);
  res.json(id);
});

// 게시글 목록 조회 (Spring Data Page 형태)
psPostRouter.get("/posts", async (req, res) => {
  const page = parsePagingParam(req.query.page, 0, "page");
  const size = parsePagingParam(req.query.size, 10, "size");

  res.json(await psPostService.getPosts(page, size));
});

// 게시글 상세 조회
psPostRouter.get("/posts/:id", async (req, res) => {
  res.json(await psPostService.getPostById(parseId(req.params.id)));
});

// 게시글 수정 — 수정된 id 를 raw number 로 반환한다 (기존 계약)
psPostRouter.put("/posts/:id", async (req, res) => {
  const id = await psPostService.updatePost(
    parseId(req.params.id),
    (req.body ?? {}) as PsPostRequest
  );

  res.json(id);
});

// 게시글 삭제 — 본문 없이 200
psPostRouter.delete("/posts/:id", async (req, res) => {
  await psPostService.deletePost(parseId(req.params.id));
  res.status(200).end();
});
