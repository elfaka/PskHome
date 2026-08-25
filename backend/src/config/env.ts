import "dotenv/config";
import { z } from "zod";

/**
 * 환경변수 스키마
 *
 * [설계 의도]
 * - 기존 Spring 의 application-{local,prod,test}.yaml 프로파일 분기를 .env 하나로 통합한다.
 * - 시크릿(Google OAuth, LostArk API Key, DB URL)은 **optional** 로 둔다.
 *   값이 없다고 프로세스 부팅 자체를 막으면, 예를 들어 LostArk 키 하나 때문에
 *   JSON Prettier / PS Post 같은 무관한 기능까지 죽는다.
 *   → 부팅은 항상 되고, 실제로 그 시크릿을 쓰는 엔드포인트만 런타임에 실패한다.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(8080),

  // --- MySQL (Prisma) ---
  DATABASE_URL: z.string().optional(),

  // --- Redis (세션 저장소) ---
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),

  // --- 세션 ---
  SESSION_SECRET: z.string().default("psk-home-dev-session-secret"),
  SESSION_COOKIE_NAME: z.string().default("psk.sid"),

  // --- Google OAuth2 ---
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /**
   * Spring Security 시절의 redirect-uri 와 **동일한 경로**를 유지한다.
   * (Google Console 에 등록된 승인 리디렉션 URI 를 다시 등록하지 않기 위함)
   */
  GOOGLE_CALLBACK_URL: z
    .string()
    .default("http://localhost:8080/api/login/oauth2/code/google"),

  // 로그인 성공 후 이동할 프론트 라우트 (기존 app.login-success-redirect)
  APP_LOGIN_SUCCESS_REDIRECT: z
    .string()
    .default("http://localhost:5173/googleform/forms"),

  // --- LostArk Open API ---
  LOSTARK_API_BASE_URL: z
    .string()
    .default("https://developer-lostark.game.onstove.com"),
  /**
   * 기존에는 application-local.yaml 에 Jasypt ENC(...) 로 저장돼 있었다.
   * Node 에는 Jasypt 가 없으므로 평문 환경변수로 관리한다.
   */
  LOSTARK_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment variables:\n${detail}`);
}

export const env = parsed.data;

export const isTest = env.NODE_ENV === "test";
export const isProduction = env.NODE_ENV === "production";
