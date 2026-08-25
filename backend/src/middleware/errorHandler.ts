import type { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError } from "../lib/httpError.js";
import { isTest } from "../config/env.js";

/**
 * 매칭되는 라우트가 없을 때의 404 처리.
 * (Spring 의 Whitelabel error page 대신 JSON 으로 통일)
 */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No handler for ${req.method} ${req.path}`,
    },
  });
};

/**
 * 전역 에러 핸들러 — 기존 `@RestControllerAdvice` 역할.
 *
 * Express 5 는 async 핸들러에서 throw 된 예외도 자동으로 이곳으로 전달한다.
 * (Express 4 처럼 try/catch + next(err) 를 매번 감쌀 필요가 없다)
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  // express.json() 의 본문 파싱 실패 (malformed JSON body)
  if (
    err instanceof SyntaxError &&
    "body" in err &&
    (err as { status?: number }).status === 400
  ) {
    res.status(400).json({
      error: { code: "INVALID_REQUEST_BODY", message: err.message },
    });
    return;
  }

  if (!isTest) {
    console.error("[unhandled error]", err);
  }

  const message =
    err instanceof Error ? err.message : "Unexpected internal error";

  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message },
  });
};
