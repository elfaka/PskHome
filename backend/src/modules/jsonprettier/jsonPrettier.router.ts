import { Router } from "express";

import {
  formatJson,
  isSupportedMode,
  JsonParseError,
  normalizeMode,
} from "./jsonPrettier.service.js";
import {
  failResponse,
  successResponse,
  type JsonFormatRequest,
} from "./jsonPrettier.types.js";

/**
 * JSON Prettier — 기존 `jsonprettier/controller/JsonFormatController.java`
 *
 * 인증이 필요 없는 stateless 공개 API. (`/api/json/**`)
 * 검증 순서와 에러 코드는 기존 컨트롤러와 동일하게 유지한다:
 *   EMPTY_INPUT → INVALID_MODE → INVALID_INDENT → (파싱) INVALID_JSON
 */
export const jsonPrettierRouter: Router = Router();

jsonPrettierRouter.post("/json/format", (req, res) => {
  const body = (req.body ?? {}) as JsonFormatRequest;
  const input = body.input ?? "";

  // 1) 빈 입력은 "빈 문자열 200" 이 아니라 400 으로 명확히 알린다.
  if (input.trim().length === 0) {
    res.status(400).json(failResponse("EMPTY_INPUT", "input is empty"));
    return;
  }

  // 2) mode 제한
  const mode = normalizeMode(body.mode);
  if (!isSupportedMode(mode)) {
    res
      .status(400)
      .json(failResponse("INVALID_MODE", "mode must be prettify or minify"));
    return;
  }

  // 3) indent 제한 (minify 면 무시되지만, 값이 오면 검증하는 편이 명확하다)
  const indent = body.indent ?? 2;
  if (indent !== 2 && indent !== 4) {
    res
      .status(400)
      .json(failResponse("INVALID_INDENT", "indent must be 2 or 4"));
    return;
  }

  const sortKeys = body.sortKeys === true;
  const ensureAscii = body.ensureAscii === true;

  try {
    const formatted = formatJson(input, mode, indent, sortKeys, ensureAscii);

    res.json(
      successResponse(mode, formatted, input.length, formatted.length)
    );
  } catch (e) {
    if (e instanceof JsonParseError) {
      res
        .status(400)
        .json(failResponse("INVALID_JSON", e.message, e.line, e.column));
      return;
    }
    throw e;
  }
});

// 간단 헬스체크
jsonPrettierRouter.get("/json/health", (_req, res) => {
  res.json({ ok: true });
});
