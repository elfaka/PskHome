import { describe, it, expect } from "vitest";

import { parseEnv } from "./env.js";

/**
 * CD 파이프라인이 만드는 `.env` 는 등록되지 않은 시크릿을 빈 값으로 남긴다
 * (`SESSION_SECRET=`). 그 상태에서도 앱이 정상 기동해야 한다.
 */
describe("parseEnv", () => {
  it("applies defaults when a variable is absent", () => {
    const env = parseEnv({});

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(8080);
    expect(env.SESSION_SECRET).not.toBe("");
    expect(env.SESSION_COOKIE_NAME).toBe("psk.sid");
  });

  it("treats an empty string as unset so defaults still apply", () => {
    const env = parseEnv({ SESSION_SECRET: "", SESSION_COOKIE_NAME: "" });

    // 빈 secret 이 그대로 들어가면 express-session 이 기동 시점에 죽는다.
    expect(env.SESSION_SECRET).not.toBe("");
    expect(env.SESSION_COOKIE_NAME).toBe("psk.sid");
  });

  it("treats an empty optional secret as undefined, not as a configured value", () => {
    const env = parseEnv({ GOOGLE_CLIENT_ID: "", DATABASE_URL: "" });

    // 빈 문자열이 남으면 "설정됨"으로 오인해 Google 전략을 등록하고 로그인이 이상하게 실패한다.
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("keeps provided values", () => {
    const env = parseEnv({
      NODE_ENV: "production",
      PORT: "9000",
      SESSION_SECRET: "real-secret",
      GOOGLE_CLIENT_ID: "client-id",
    });

    expect(env.NODE_ENV).toBe("production");
    expect(env.PORT).toBe(9000);
    expect(env.SESSION_SECRET).toBe("real-secret");
    expect(env.GOOGLE_CLIENT_ID).toBe("client-id");
  });

  it("rejects an invalid value", () => {
    expect(() => parseEnv({ NODE_ENV: "staging" })).toThrow(
      /Invalid environment variables/
    );
  });
});
