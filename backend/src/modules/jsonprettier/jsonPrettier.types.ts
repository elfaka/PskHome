export type JsonFormatMode = "prettify" | "minify";

/** 요청 본문 — 기존 `JsonFormatRequestDto` */
export interface JsonFormatRequest {
  input?: string | null;
  mode?: string | null;
  indent?: number | null;
  sortKeys?: boolean | null;
  ensureAscii?: boolean | null;
}

export interface JsonFormatStats {
  inputLength: number;
  outputLength: number;
}

export interface JsonFormatErrorBody {
  code: string;
  message: string;
  line?: number;
  column?: number;
}

/**
 * 응답 본문 — 기존 `JsonFormatResponseDto`
 *
 * 프론트(`src/api/jsonPrettierApi.ts`)의 `JsonFormatResponse` 와 동일한 형태여야 한다.
 * 프론트는 `ok`, `formatted`, `stats`, `error?.{message,line,column}` 만 참조하므로
 * null 필드는 직렬화에서 제외한다.
 */
export interface JsonFormatResponse {
  ok: boolean;
  mode?: string;
  formatted?: string;
  stats?: JsonFormatStats;
  error?: JsonFormatErrorBody;
}

export function successResponse(
  mode: string,
  formatted: string,
  inputLength: number,
  outputLength: number
): JsonFormatResponse {
  return { ok: true, mode, formatted, stats: { inputLength, outputLength } };
}

export function failResponse(
  code: string,
  message: string,
  line?: number,
  column?: number
): JsonFormatResponse {
  return { ok: false, error: { code, message, line, column } };
}
