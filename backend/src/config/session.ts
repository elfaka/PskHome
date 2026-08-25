import { RedisStore } from "connect-redis";
import type { RequestHandler } from "express";
import session from "express-session";
import { createClient } from "redis";

import { env, isProduction, isTest } from "./env.js";

/**
 * 세션 미들웨어.
 *
 * 기존 Spring Session(JSESSIONID) + Redis 구성을 승계한다.
 * - 테스트 환경에서는 Redis 에 붙지 않고 기본 MemoryStore 를 쓴다.
 *   (테스트는 외부 의존 없이 돌아야 한다)
 * - Redis 연결은 await 하지 않는다. node-redis 는 연결 중에도 명령을 큐잉하므로
 *   앱 조립을 동기로 유지할 수 있고, Redis 가 늦게 떠도 기동이 막히지 않는다.
 */
function createRedisStore(): RedisStore {
  const client = createClient({
    socket: { host: env.REDIS_HOST, port: env.REDIS_PORT },
  });

  client.on("error", (err) => {
    console.error("[redis] client error:", err);
  });

  void client.connect().catch((err) => {
    console.error("[redis] initial connection failed:", err);
  });

  return new RedisStore({ client });
}

export function createSessionMiddleware(): RequestHandler {
  return session({
    name: env.SESSION_COOKIE_NAME,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: isTest ? undefined : createRedisStore(),
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
