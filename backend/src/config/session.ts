import type { RequestHandler } from "express";
import session from "express-session";

import { env, isProduction } from "./env.js";

/**
 * 세션 미들웨어.
 *
 * [저장소를 메모리에 두는 이유]
 * 기존 Spring 백엔드는 `spring-boot-starter-data-redis` 의존성을 갖고 있었지만
 * `spring-session-data-redis` 가 없어서 **HTTP 세션이 Redis 에 저장된 적이 없다**.
 * 세션은 Tomcat 프로세스 메모리에 있었다. 즉 여기 MemoryStore 가 기존 동작과 같다.
 *
 * [따라오는 제약 — 의도된 것]
 * - 프로세스를 재시작하면 로그인 세션이 사라진다 (배포할 때마다 재로그인)
 * - 인스턴스를 여러 개로 늘리면 세션이 공유되지 않는다
 * 현재는 단일 인스턴스라 무방하다. 확장이 필요해지면 그때 외부 세션 저장소를 붙인다.
 */
export function createSessionMiddleware(): RequestHandler {
  return session({
    name: env.SESSION_COOKIE_NAME,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // OAuth2 는 Google 에서 우리 콜백으로 돌아오는 top-level 이동이므로
      // lax 여야 콜백 요청에 세션 쿠키가 실린다. (strict 면 로그인 플로우가 깨진다)
      sameSite: "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24, // 1일
    },
  });
}
