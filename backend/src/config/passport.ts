import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

import { env } from "./env.js";

/**
 * Google OAuth2 로그인 설정.
 *
 * 기존 `spring.security.oauth2.client.registration.google` 의 scope 를 그대로 옮긴다.
 * Drive/Forms 읽기 권한이 함께 있어야 survey 모듈이 사용자 설문에 접근할 수 있다.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "profile",
  "email",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/forms.body.readonly",
  "https://www.googleapis.com/auth/forms.responses.readonly",
];

/**
 * 전략 등록.
 *
 * client id/secret 이 없으면 등록하지 않고 false 를 돌려준다.
 * (시크릿 하나 때문에 앱 전체가 기동하지 못하는 상황을 막는다 — 로그인 경로만 503 이 된다)
 */
let configured: boolean | null = null;

export function configurePassport(): boolean {
  // createApp() 이 여러 번 호출돼도(테스트) 전략이 중복 등록되지 않도록 한 번만 수행한다.
  if (configured !== null) return configured;

  passport.serializeUser<Express.User>((user, done) => {
    done(null, user);
  });

  passport.deserializeUser<Express.User>((user, done) => {
    done(null, user);
  });

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    console.warn(
      "[auth] GOOGLE_CLIENT_ID/SECRET is not configured; Google login is disabled."
    );
    configured = false;
    return configured;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
      },
      (accessToken, refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value;

        done(null, {
          id: profile.id,
          // 헤더 표시용 이름. displayName 이 없으면 이메일, 그것도 없으면 계정 식별자.
          name: profile.displayName || email || profile.id,
          email,
          accessToken,
          refreshToken,
        });
      }
    )
  );

  configured = true;
  return configured;
}

export { passport };
