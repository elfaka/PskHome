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
 *
 * [주의] 사용자명/비밀번호에 `@ : / ? #` 가 들어가면 퍼센트 인코딩해야 한다.
 * (예: `p@ss` → `p%40ss`)
 */
export function poolConfigFromUrl(databaseUrl: string) {
  let url: URL;

  try {
    url = new URL(databaseUrl);
  } catch {
    throw HttpError.internal(
      "DATABASE_URL is not a valid connection URL. " +
        "Expected mysql://user:password@host:port/database " +
        "(percent-encode any @ : / ? # in the credentials)."
    );
  }

  const database = url.pathname.replace(/^\//, "");

  if (!url.hostname || !database) {
    throw HttpError.internal(
      "DATABASE_URL is missing a host or database name."
    );
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit: 10,

    /**
     * MySQL 8 의 기본 인증 플러그인은 `caching_sha2_password` 다.
     * 서버에 자격증명이 캐시돼 있지 않으면(예: MySQL 재시작 직후) full authentication 이
     * 필요하고, 평문 연결에서는 서버의 RSA 공개키를 받아와야 한다.
     *
     * mariadb 커넥터는 이 옵션이 false(기본값) 면 공개키 요청을 거부하고
     * handshake 를 치명적 오류로 끊는다. 그러면 커넥션이 하나도 만들어지지 않고,
     * 증상은 엉뚱하게도 "pool timeout ... active=0 idle=0" 으로만 드러난다.
     *
     * 기존 Spring 이 멀쩡했던 이유는 Connector-J 가 `sslMode=PREFERRED` 로
     * TLS 연결을 맺어 이 분기를 아예 타지 않았기 때문이다.
     *
     * 연결은 Docker 내부 네트워크 안에서만 이뤄진다.
     */
    allowPublicKeyRetrieval: true,
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
