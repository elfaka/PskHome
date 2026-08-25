import type { JsonFormatMode } from "./jsonPrettier.types.js";

/**
 * JSON 파싱 실패 예외.
 *
 * 기존에는 Jackson 의 `JsonProcessingException` 을 `@RestControllerAdvice` 가 받아
 * `INVALID_JSON` + line/column 으로 변환했다.
 * Node 에는 그런 위치정보가 표준화돼 있지 않으므로, 여기서 직접 계산해 담는다.
 * (line/column 은 프론트 `indexFromLineCol` 규약에 맞춰 **1-based**)
 */
export class JsonParseError extends Error {
  readonly line?: number;
  readonly column?: number;

  constructor(message: string, line?: number, column?: number) {
    super(message);
    this.name = "JsonParseError";
    this.line = line;
    this.column = column;
  }
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * JSON 포맷/압축 — 기존 `JsonFormatService.format(...)`
 *
 * 계약(기존 동작 그대로):
 * - input 이 null / 빈 문자열 / 공백뿐이면 **빈 문자열**을 반환한다 (예외 아님).
 *   400 EMPTY_INPUT 판정은 라우터의 책임이다.
 * - sortKeys 는 중첩 객체까지 재귀적으로 정렬하며, 배열의 순서는 보존한다.
 * - ensureAscii 는 비 ASCII 문자를 \uXXXX 로 이스케이프한다.
 */
export function formatJson(
  input: string | null | undefined,
  mode: string,
  indent: number,
  sortKeys: boolean,
  ensureAscii: boolean
): string {
  const trimmed = (input ?? "").trim();
  if (trimmed.length === 0) return "";

  let node = parseJson(trimmed);

  if (sortKeys) {
    node = sortJsonKeys(node);
  }

  const serialized =
    mode.toLowerCase() === "minify"
      ? JSON.stringify(node)
      : JSON.stringify(node, null, indent === 4 ? 4 : 2);

  // JSON.stringify 는 undefined 를 반환할 수 없는 입력만 들어오므로(파싱 결과) 안전하다.
  const out = serialized ?? "";

  return ensureAscii ? escapeNonAscii(out) : out;
}

/**
 * JSON.parse 를 감싸 위치정보(line/column)를 붙인다.
 *
 * V8 의 에러 메시지는 버전에 따라 "at position N" 또는
 * "at position N (line L column C)" 형태라 문구 파싱에만 의존할 수 없다.
 * position 만 뽑아 직접 line/column 을 계산해 결정적으로 만든다.
 */
function parseJson(text: string): JsonValue {
  try {
    return JSON.parse(text) as JsonValue;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid JSON";
    const position = extractPosition(message);

    if (position == null) {
      throw new JsonParseError(message);
    }

    const { line, column } = lineColumnFromPosition(text, position);
    throw new JsonParseError(message, line, column);
  }
}

function extractPosition(message: string): number | null {
  const m = message.match(/at position (\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function lineColumnFromPosition(
  text: string,
  position: number
): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(position, text.length));

  let line = 1;
  let lastNewline = -1;

  for (let i = 0; i < clamped; i++) {
    if (text[i] === "\n") {
      line++;
      lastNewline = i;
    }
  }

  return { line, column: clamped - lastNewline };
}

/** 객체 키를 사전순으로 재귀 정렬한다. 배열 요소 순서는 건드리지 않는다. */
function sortJsonKeys(node: JsonValue): JsonValue {
  if (Array.isArray(node)) {
    return node.map(sortJsonKeys);
  }

  if (node !== null && typeof node === "object") {
    const sorted: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(node).sort()) {
      sorted[key] = sortJsonKeys(node[key]);
    }
    return sorted;
  }

  return node;
}

/**
 * 비 ASCII 문자를 \uXXXX 로 이스케이프한다.
 * Jackson 의 `ESCAPE_NON_ASCII` 와 동일하게 **UTF-16 코드 유닛 단위**로 처리하므로
 * 서로게이트 페어(이모지 등)는 두 개의 \uXXXX 로 나뉘어 출력된다.
 */
function escapeNonAscii(text: string): string {
  let out = "";

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out +=
      code > 0x7f
        ? `\\u${code.toString(16).padStart(4, "0")}`
        : text[i];
  }

  return out;
}

export function normalizeMode(mode: string | null | undefined): string {
  if (mode == null || mode.trim().length === 0) return "prettify";
  return mode.trim().toLowerCase();
}

export function isSupportedMode(mode: string): mode is JsonFormatMode {
  return mode === "prettify" || mode === "minify";
}
