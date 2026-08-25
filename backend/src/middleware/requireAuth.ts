import type { RequestHandler } from "express";

import { HttpError } from "../lib/httpError.js";

/**
 * 인증 게이트 — 기존 `SecurityConfig` 의 `.requestMatchers("/api/**").authenticated()` 대응.
 *
 * 보안 경계는 그대로 유지하되(공개 라우터는 이 미들웨어를 붙이지 않는다),
 * 미인증 응답은 Google 로 리다이렉트하지 않고 401 JSON 을 돌려준다.
 * XHR 로 호출하는 API 에서는 302 리다이렉트보다 401 이 프론트가 다루기 쉽다.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (req.isAuthenticated?.() && req.user) {
    next();
    return;
  }

  next(HttpError.unauthorized("Authentication is required."));
};
