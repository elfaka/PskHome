import { HttpError } from "../../lib/httpError.js";
import { toPage, type Page } from "../../lib/page.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  toPsPostResponse,
  type PsPostRequest,
  type PsPostResponse,
  type PsPostRow,
} from "./psPost.types.js";

/**
 * PS 문제풀이 게시글 CRUD — 기존 `pspost/service/PsPostService.java`
 */

/**
 * 게시글 생성.
 *
 * [기존 동작 유지] `isSolved` 는 요청값과 무관하게 항상 true 로 저장한다.
 * (기존 서비스가 `.isSolved(true)` 로 하드코딩되어 있었다)
 */
export async function createPost(dto: PsPostRequest): Promise<number> {
  const created = await getPrisma().psPost.create({
    data: {
      title: dto.title ?? null,
      site: dto.site ?? null,
      problemNumber: dto.problemNumber ?? null,
      link: dto.link ?? null,
      level: dto.level ?? null,
      language: dto.language ?? null,
      solution: dto.solution ?? null,
      contentMd: dto.contentMd ?? null,
      isSolved: true,
      // 기존 @CreationTimestamp 대응 (DB 기본값에 의존하지 않고 애플리케이션에서 채운다)
      createdAt: new Date(),
    },
    select: { id: true },
  });

  return Number(created.id);
}

/** 게시글 목록 — 생성일 내림차순 페이지네이션. */
export async function getPosts(
  page: number,
  size: number
): Promise<Page<PsPostResponse>> {
  const prisma = getPrisma();

  const [rows, totalElements] = await Promise.all([
    prisma.psPost.findMany({
      orderBy: { createdAt: "desc" },
      skip: page * size,
      take: size,
    }),
    prisma.psPost.count(),
  ]);

  return toPage(
    (rows as PsPostRow[]).map(toPsPostResponse),
    page,
    size,
    totalElements
  );
}

/** 게시글 단건 조회. */
export async function getPostById(id: number): Promise<PsPostResponse> {
  const row = await getPrisma().psPost.findUnique({
    where: { id: BigInt(id) },
  });

  if (!row) {
    throw HttpError.notFound(`해당 게시글이 없습니다. id=${id}`);
  }

  return toPsPostResponse(row as PsPostRow);
}

/**
 * 게시글 수정.
 *
 * [기존 동작 유지] `isSolved` 는 요청에 값이 있을 때만 갱신한다.
 * (기존 `PsPost.update(dto)` 가 `if (dto.getIsSolved() != null)` 로 분기했다)
 */
export async function updatePost(
  id: number,
  dto: PsPostRequest
): Promise<number> {
  const prisma = getPrisma();

  const existing = await prisma.psPost.findUnique({
    where: { id: BigInt(id) },
    select: { id: true },
  });

  if (!existing) {
    throw HttpError.notFound(`해당 게시글이 없습니다. id=${id}`);
  }

  const updated = await prisma.psPost.update({
    where: { id: BigInt(id) },
    data: {
      title: dto.title ?? null,
      site: dto.site ?? null,
      problemNumber: dto.problemNumber ?? null,
      link: dto.link ?? null,
      level: dto.level ?? null,
      language: dto.language ?? null,
      solution: dto.solution ?? null,
      contentMd: dto.contentMd ?? null,
      ...(dto.isSolved != null ? { isSolved: dto.isSolved } : {}),
    },
    select: { id: true },
  });

  return Number(updated.id);
}

/**
 * 게시글 삭제.
 *
 * [기존 동작 유지] 존재하지 않는 id 라도 오류가 아니다.
 * (Spring Data 의 `deleteById` 는 대상이 없으면 아무 것도 하지 않는다)
 */
export async function deletePost(id: number): Promise<void> {
  const prisma = getPrisma();

  const existing = await prisma.psPost.findUnique({
    where: { id: BigInt(id) },
    select: { id: true },
  });

  if (!existing) return;

  await prisma.psPost.delete({ where: { id: BigInt(id) } });
}
