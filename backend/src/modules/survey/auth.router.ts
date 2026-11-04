import { Router } from "express";

import { env } from "../../config/env.js";
import { GOOGLE_SCOPES, passport } from "../../config/passport.js";
import { HttpError } from "../../lib/httpError.js";

/**
 * 로그인 뒤 돌아갈 경로 (`?returnTo=/flights`).
 * 사이트 안의 경로(`/` 로 시작)만 받는다. `//evil.com`, 역슬래시, 공백이 섞인 값은 오픈 리다이렉트가 되므로 버린다.
 */
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 512) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\s]/.test(raw)) return null;
  return raw;
}

/** 로그인 성공 후 이동할 URL. 돌아갈 경로가 있으면 `APP_LOGIN_SUCCESS_REDIRECT` 와 같은 출처(origin)에 붙인다 */
export function loginSuccessUrl(returnTo: string | null | undefined): string {
  const fallback = env.APP_LOGIN_SUCCESS_REDIRECT;
  const path = safeReturnPath(returnTo);
  if (!path) return fallback;

  const origin = new URL(fallback).origin;
  const target = new URL(path, origin);
  return target.origin === origin ? target.toString() : fallback;
}

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

    // 돌아갈 경로는 세션에 잠깐 둔다. Google 을 다녀오는 동안 쿼리스트링은 사라진다.
    const returnTo = safeReturnPath(req.query.returnTo);
    if (returnTo) req.session.returnTo = returnTo;
    else delete req.session.returnTo;

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

        // passport 0.6+ 는 로그인할 때 세션을 새로 만든다(세션 고정 공격 방지) — 그 전에 꺼내 둔다.
        const returnTo = req.session.returnTo;

        req.logIn(user, (loginErr) => {
          if (loginErr) {
            next(loginErr);
            return;
          }

          // 기존 `defaultSuccessUrl(url, true)` 와 같이 기본은 APP_LOGIN_SUCCESS_REDIRECT.
          // 로그인 시작 때 returnTo 를 줬으면 같은 출처의 그 경로로 보낸다 (예: /flights).
          res.redirect(loginSuccessUrl(returnTo));
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
