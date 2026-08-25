import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { env } from "../config/env.js";
import { HttpError } from "./httpError.js";

/**
 * Prisma 7 은 런타임 접속을 driver adapter 로 처리한다.
 * MySQL 8 은 MariaDB 어댑터(`@prisma/adapter-mariadb`)로 접속한다.
 *
 * [지연 초기화]
 * import 시점이 아니라 첫 사용 시점에 클라이언트를 만든다.
 * - 테스트는 이 모듈을 mock 하므로 DB 없이도 앱 조립/라우팅 검증이 가능하다.
 * - DATABASE_URL 이 없어도 프로세스는 기동되고, DB 를 쓰는 요청만 실패한다.
 */
let client: PrismaClient | null = null;

/**
 * `mysql://user:pass@host:port/db` 형태의 URL 을 mariadb PoolConfig 로 변환한다.
 * 커넥터마다 URL 스킴 해석이 달라 오해의 소지가 있어, 명시적으로 분해한다.
 */
function poolConfigFromUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectionLimit: 10,
  };
}

export function getPrisma(): PrismaClient {
  if (client) return client;

  if (!env.DATABASE_URL) {
    throw HttpError.internal(
      "DATABASE_URL is not configured; database-backed endpoints are unavailable."
    );
  }

  const adapter = new PrismaMariaDb(poolConfigFromUrl(env.DATABASE_URL));
  client = new PrismaClient({ adapter });

  return client;
}

/** 그레이스풀 셧다운용. */
export async function disconnectPrisma(): Promise<void> {
  if (!client) return;
  await client.$disconnect();
  client = null;
}
