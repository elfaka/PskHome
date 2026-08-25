import { Router } from "express";

import { env } from "../../config/env.js";
import { GOOGLE_SCOPES, passport } from "../../config/passport.js";
import { HttpError } from "../../lib/httpError.js";

/**
 * 인증/로그인 — 기존 `survey/controller/AuthController.java` + `config/SecurityConfig` 의
 * oauth2Login / logout 설정을 합친 라우터.
 *
 * [경로를 그대로 유지하는 이유]
 * reverse proxy 뒤에서 OAuth2 redirect_uri 는 도메인/경로에 매우 민감하다.
 * 기존과 동일한 `/api/oauth2/authorization/google`, `/api/login/oauth2/code/google` 을 유지해
 * Google Console 의 승인된 리디렉션 URI 를 다시 등록하지 않아도 되게 한다.
 */
export function createAuthRouter(googleLoginEnabled: boolean): Router {
  const router = Router();

  function ensureGoogleEnabled() {
    if (googleLoginEnabled) return null;

    return new HttpError(
      503,
      "GOOGLE_LOGIN_DISABLED",
      "Google login is not configured on this server."
    );
  }

  // 로그인 시작 — 프론트 Login 페이지가 window.location.href 로 이동시키는 경로
  router.get("/oauth2/authorization/google", (req, res, next) => {
    const disabled = ensureGoogleEnabled();
    if (disabled) {
      next(disabled);
      return;
    }

    passport.authenticate("google", { scope: GOOGLE_SCOPES })(req, res, next);
  });

  // 콜백 — Google 이 인가코드를 들고 돌아오는 경로
  router.get("/login/oauth2/code/google", (req, res, next) => {
    const disabled = ensureGoogleEnabled();
    if (disabled) {
      next(disabled);
      return;
    }

    passport.authenticate(
      "google",
      (err: unknown, user: Express.User | false) => {
        if (err) {
          next(err);
          return;
        }

        if (!user) {
          next(HttpError.unauthorized("Google login failed."));
          return;
        }

        req.logIn(user, (loginErr) => {
          if (loginErr) {
            next(loginErr);
            return;
          }

          // 기존 `defaultSuccessUrl(url, true)` 와 동일하게 **항상** 이 URL 로 보낸다.
          res.redirect(env.APP_LOGIN_SUCCESS_REDIRECT);
        });
      }
    )(req, res, next);
  });

  /**
   * 로그인 상태 조회 (공개 — 로그인 전에도 프론트가 호출한다).
   * 미인증이라고 401 을 내면 안 된다.
   */
  router.get("/auth/me", (req, res) => {
    if (!req.isAuthenticated?.() || !req.user) {
      res.json({ authenticated: false });
      return;
    }

    res.json({ authenticated: true, name: req.user.name });
  });

  /** 로그아웃 — 세션 무효화 + 세션 쿠키 삭제 */
  router.post("/auth/logout", (req, res, next) => {
    const finish = () => {
      req.session?.destroy((destroyErr) => {
        if (destroyErr) {
          next(destroyErr);
          return;
        }

        res.clearCookie(env.SESSION_COOKIE_NAME);
        res.status(200).end();
      });
    };

    if (typeof req.logout !== "function") {
      finish();
      return;
    }

    req.logout((logoutErr) => {
      if (logoutErr) {
        next(logoutErr);
        return;
      }
      finish();
    });
  });

  return router;
}
