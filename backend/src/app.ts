import express from "express";

import { configurePassport, passport } from "./config/passport.js";
import { createSessionMiddleware } from "./config/session.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { characterRouter } from "./modules/character/character.router.js";
import { jsonPrettierRouter } from "./modules/jsonprettier/jsonPrettier.router.js";
import { pingRouter } from "./modules/ping/ping.router.js";
import { psPostRouter } from "./modules/pspost/psPost.router.js";
import { createAuthRouter } from "./modules/survey/auth.router.js";
import { formsRouter } from "./modules/survey/forms.router.js";

/**
 * Express 앱 조립.
 *
 * [설계 의도]
 * - `index.ts`(부트스트랩)와 분리해, 테스트에서 supertest 로 서버를 띄우지 않고
 *   앱 인스턴스만 만들어 검증할 수 있게 한다. (기존 MockMvc 와 같은 역할)
 * - 보안 경계는 기존 `config/SecurityConfig.java` 와 동일하게 유지한다:
 *   공개 라우터는 그대로 mount 하고, 인증이 필요한 라우터에만 `requireAuth` 를 붙인다.
 */
export function createApp(): express.Express {
  const app = express();

  // 기존 `server.forward-headers-strategy: framework` 대응.
  // traefik/nginx 뒤에서 X-Forwarded-* 를 신뢰해 https/host 를 올바르게 인식한다.
  app.set("trust proxy", true);
  app.disable("x-powered-by");

  // JSON Prettier 는 큰 입력을 받을 수 있으므로 기본 100kb 로는 부족하다.
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  const googleLoginEnabled = configurePassport();

  app.use(createSessionMiddleware());
  app.use(passport.initialize());
  app.use(passport.session());

  const api = express.Router();

  // --- 공개 (인증 불필요) ---
  api.use(pingRouter);
  api.use(jsonPrettierRouter);
  api.use(psPostRouter);
  api.use(createAuthRouter(googleLoginEnabled));

  // --- 인증 필요 ---
  api.use(formsRouter);
  api.use(characterRouter);

  app.use("/api", api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
