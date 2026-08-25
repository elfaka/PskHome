import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 부터 접속 URL 은 schema.prisma 가 아니라 이 파일에서 관리한다.
 * (schema 의 `datasource { url = env(...) }` 는 더 이상 지원되지 않음)
 *
 * 여기 설정은 CLI 용(introspect/migrate)이며,
 * 런타임 접속은 `src/lib/prisma.ts` 의 driver adapter 가 담당한다.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // `env()` 헬퍼는 값이 없으면 즉시 throw 한다.
    // CI 의 `prisma generate` 는 DB 접속이 필요 없으므로 빈 문자열을 허용한다.
    url: process.env.DATABASE_URL ?? "",
  },
});
