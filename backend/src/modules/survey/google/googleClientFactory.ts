import { google, type drive_v3, type forms_v1 } from "googleapis";

import { HttpError } from "../../../lib/httpError.js";

/**
 * Google API 클라이언트 팩토리 — 기존 `survey/google/GoogleClientFactory.java`
 *
 * 기존에는 `OAuth2AuthorizedClientService` 에서 사용자별 access token 을 꺼내 썼다.
 * 여기서는 로그인 시 세션에 저장해 둔 `req.user.accessToken` 을 사용한다.
 * 서비스 계층이 인증 구현을 몰라도 되도록 이 파일에 격리한다.
 */

const TIMEOUT_MS = 30_000;

function authFor(user: Express.User) {
  if (!user.accessToken) {
    throw HttpError.unauthorized("No Google access token found for this session.");
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: user.accessToken });

  return auth;
}

export function driveClient(user: Express.User): drive_v3.Drive {
  return google.drive({
    version: "v3",
    auth: authFor(user),
    timeout: TIMEOUT_MS,
  });
}

export function formsClient(user: Express.User): forms_v1.Forms {
  return google.forms({
    version: "v1",
    auth: authFor(user),
    timeout: TIMEOUT_MS,
  });
}

/**
 * Google API 호출 실패를 HTTP 응답으로 옮긴다.
 *
 * 기존 Java 는 전부 RuntimeException 으로 감싸 500 이 나갔다.
 * access token 만료(401)/권한 부족(403)/없는 설문(404) 은 서버 장애가 아니라
 * 프론트가 다르게 안내해야 하는 상황이므로 상태코드를 살려서 전달한다.
 */
export function toHttpError(error: unknown, message: string): HttpError {
  const status = (error as { code?: unknown })?.code;
  const detail = error instanceof Error ? error.message : String(error);

  if (status === 401 || status === 403 || status === 404) {
    return new HttpError(status, `GOOGLE_${status}`, `${message}: ${detail}`);
  }

  return HttpError.internal(`${message}: ${detail}`);
}
