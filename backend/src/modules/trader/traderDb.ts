import * as mariadb from "mariadb";

import { env } from "../../config/env.js";
import { HttpError } from "../../lib/httpError.js";
import { poolConfigFromUrl } from "../../lib/prisma.js";

/**
 * 자동매매 엔진 DB(trader) 연결.
 *
 * - 계정은 trader_web. 조회(traderQuery)는 SELECT 만 쓴다
 * - 쓰기(withTraderTx)는 화면 제어(traderControl.service.ts)만 쓴다: engine_state(INSERT·UPDATE), risk_events(INSERT).
 *   주문·체결·잔고 테이블에는 쓰지 않는다 (권한도 없다)
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
    // 쿼리별 timeout 옵션은 MariaDB 서버 전용이라 MySQL 에서는 오류가 난다.
    // MySQL 은 세션 변수로 SELECT 실행 시간을 제한한다 (ms).
    initSql: "SET SESSION max_execution_time = 5000",
  });
  return pool;
}

export async function traderQuery<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  let rows: unknown;
  try {
    rows = await getTraderPool().query(sql, params);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    // 원인은 서버 로그에만 남기고 화면에는 일반 메시지 (502/504 는 Cloudflare 가 본문을 버려서 쓰지 않는다)
    console.error("[trader-db]", e instanceof Error ? e.message : e);
    throw new HttpError(503, "TRADER_DB_UNAVAILABLE", "자동매매 DB 를 조회하지 못했습니다.");
  }
  return Array.from(rows as ArrayLike<T>);
}

export type TraderTx = {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
};

/** MySQL 권한 부족 (ER_TABLEACCESS_DENIED_ERROR 등) */
function isPermissionError(e: unknown): boolean {
  const errno = (e as { errno?: number } | null)?.errno;
  return errno === 1142 || errno === 1143 || errno === 1044;
}

/**
 * 한 트랜잭션으로 쓴다. 실패하면 되돌린다.
 * trader_web 에 쓰기 권한이 아직 없으면 503 TRADER_DB_NO_WRITE (조회는 계속 동작한다).
 */
export async function withTraderTx<R>(fn: (tx: TraderTx) => Promise<R>): Promise<R> {
  let conn: mariadb.PoolConnection | null = null;
  try {
    conn = await getTraderPool().getConnection();
    await conn.beginTransaction();
    const c = conn;
    const result = await fn({
      query: async <T>(sql: string, params: unknown[] = []) => Array.from((await c.query(sql, params)) as ArrayLike<T>),
    });
    await conn.commit();
    return result;
  } catch (e) {
    if (conn) await conn.rollback().catch(() => undefined);
    if (e instanceof HttpError) throw e;
    if (isPermissionError(e)) {
      console.error("[trader-db] write denied", e instanceof Error ? e.message : e);
      throw new HttpError(
        503,
        "TRADER_DB_NO_WRITE",
        "자동매매 DB 쓰기 권한이 없습니다. trader/db/grant_web_control.sql 을 실행해야 합니다."
      );
    }
    console.error("[trader-db]", e instanceof Error ? e.message : e);
    throw new HttpError(503, "TRADER_DB_UNAVAILABLE", "자동매매 DB 에 기록하지 못했습니다.");
  } finally {
    if (conn) await conn.release();
  }
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
