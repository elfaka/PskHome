import * as mariadb from "mariadb";

import { env } from "../../config/env.js";
import { HttpError } from "../../lib/httpError.js";
import { poolConfigFromUrl } from "../../lib/prisma.js";

/**
 * 자동매매 엔진 DB(trader) 읽기 전용 연결.
 *
 * - 계정은 trader_web (SELECT 만). 이 모듈에는 쓰기 쿼리를 두지 않는다
 * - DECIMAL 은 문자열로 받는다 (float 을 거치지 않는다). 화면도 문자열을 그대로 포맷한다
 * - DATETIME 은 엔진이 UTC 로 저장한다 → 문자열로 받아 ISO(Z) 로 바꾼다
 * - TRADER_DATABASE_URL 이 없으면 대시보드 API 만 503 (다른 기능은 영향 없음)
 */
let pool: mariadb.Pool | null = null;

export function getTraderPool(): mariadb.Pool {
  if (pool) return pool;
  if (!env.TRADER_DATABASE_URL) {
    throw new HttpError(503, "TRADER_DB_NOT_CONFIGURED", "자동매매 DB 접속 정보가 설정되지 않았습니다.");
  }
  pool = mariadb.createPool({
    ...poolConfigFromUrl(env.TRADER_DATABASE_URL),
    connectionLimit: 3,
    dateStrings: true,
    decimalAsNumber: false,
    bigIntAsNumber: true,
    checkDuplicate: false,
  });
  return pool;
}

export async function traderQuery<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  let rows: unknown;
  try {
    rows = await getTraderPool().query({ sql, timeout: 5_000 }, params);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    // 원인은 서버 로그에만 남기고 화면에는 일반 메시지 (502/504 는 Cloudflare 가 본문을 버려서 쓰지 않는다)
    console.error("[trader-db]", e instanceof Error ? e.message : e);
    throw new HttpError(503, "TRADER_DB_UNAVAILABLE", "자동매매 DB 를 조회하지 못했습니다.");
  }
  return Array.from(rows as ArrayLike<T>);
}

/** "2026-11-26 00:30:00.123456" (UTC) → "2026-11-26T00:30:00.123Z" */
export function utcIso(value: string | null): string | null {
  if (value == null) return null;
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/.exec(value);
  if (!m) return value;
  const ms = (m[3] ?? "").padEnd(3, "0").slice(0, 3);
  return `${m[1]}T${m[2]}.${ms}Z`;
}

/** 테스트용 */
export async function closeTraderPool(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
}
