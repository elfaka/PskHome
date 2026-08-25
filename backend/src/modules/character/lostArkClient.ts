import axios, { type AxiosInstance } from "axios";

import { env } from "../../config/env.js";
import { HttpError } from "../../lib/httpError.js";

/**
 * LostArk Open API 클라이언트 — 기존 `character/feign/LostArkFeignClient.java`
 *
 * OpenFeign 의 `@FeignClient(name = "open-api")` 설정(baseURL + Authorization 헤더)을
 * axios 인스턴스로 옮긴 것이다.
 *
 * [키 관리 변경]
 * 기존에는 application-local.yaml 에 Jasypt 로 `ENC(...)` 암호화되어 있었다.
 * Jasypt 는 Java 전용이라 Node 에서 복호화할 수 없으므로 평문 환경변수로 관리한다.
 */
let instance: AxiosInstance | null = null;

export function getLostArkClient(): AxiosInstance {
  if (instance) return instance;

  if (!env.LOSTARK_API_KEY) {
    throw new HttpError(
      503,
      "LOSTARK_API_KEY_MISSING",
      "LOSTARK_API_KEY is not configured on this server."
    );
  }

  instance = axios.create({
    baseURL: env.LOSTARK_API_BASE_URL,
    timeout: 30_000,
    headers: {
      Authorization: env.LOSTARK_API_KEY,
      accept: "application/json",
    },
  });

  return instance;
}

/** 테스트/재설정용 — 캐시된 인스턴스를 버린다. */
export function resetLostArkClient(): void {
  instance = null;
}
