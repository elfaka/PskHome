/** 요청 본문 — 기존 `PsPostRequestDto` */
export interface PsPostRequest {
  title?: string | null;
  site?: string | null;
  problemNumber?: string | null;
  link?: string | null;
  level?: string | null;
  language?: string | null;
  solution?: string | null;
  contentMd?: string | null;
  isSolved?: boolean | null;
}

/**
 * 응답 본문 — 기존 `PsPostResponseDto`
 *
 * 프론트 `src/api/pspost.ts` 의 `PsPost` 타입과 필드가 일치해야 한다.
 * - `id` 는 DB 가 BIGINT 이지만 JSON 에서는 **number** 다 (프론트 타입이 number).
 * - `createdAt` 은 `new Date(...)` 로 파싱 가능한 ISO 8601 문자열이다.
 */
export interface PsPostResponse {
  id: number;
  title: string | null;
  site: string | null;
  problemNumber: string | null;
  link: string | null;
  level: string | null;
  language: string | null;
  solution: string | null;
  contentMd: string | null;
  isSolved: boolean | null;
  createdAt: string | null;
}

/** Prisma 가 돌려주는 행 형태 (BigInt / Date 원본) */
export interface PsPostRow {
  id: bigint;
  title: string | null;
  site: string | null;
  problemNumber: string | null;
  link: string | null;
  level: string | null;
  language: string | null;
  solution: string | null;
  contentMd: string | null;
  isSolved: boolean | null;
  createdAt: Date | null;
}

export function toPsPostResponse(row: PsPostRow): PsPostResponse {
  return {
    id: Number(row.id),
    title: row.title,
    site: row.site,
    problemNumber: row.problemNumber,
    link: row.link,
    level: row.level,
    language: row.language,
    solution: row.solution,
    contentMd: row.contentMd,
    isSolved: row.isSolved,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
  };
}
