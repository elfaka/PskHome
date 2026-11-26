-- ─────────────────────────────────────────────────────────────────────────────
-- 운영 DB(pskhome-db-1, MySQL 8.0.46)에 trader 전용 DB 와 최소 권한 계정을 만든다.
--
-- ⚠️ 이 파일은 사용자가 직접 실행한다. 엔진·CI·배포 스크립트는 실행하지 않는다.
-- ⚠️ 다른 데이터베이스(page 등)에는 아무 권한도 주지 않고, 건드리지도 않는다.
--
-- 실행 전에 <...> 비밀번호 3개를 각각 다른 긴 임의 문자열로 바꾼다.
-- 바꾼 값은 서버의 server/trader.env 에만 적는다 (git·채팅·로그에 남기지 않는다).
--
-- 실행 예 (서버에서, 파일을 컨테이너로 넘겨 실행):
--   docker exec -i pskhome-db-1 mysql -uroot -p < create_users.sql
--
-- 접속 호스트는 Docker 네트워크 traefik(172.26.0.0/16) 안으로 제한한다.
-- 3306 이 호스트에 공개돼 있어도 이 계정들은 외부에서 접속할 수 없다.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS trader
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

-- 1) 마이그레이션 전용: trader DB 의 스키마 변경만 (alembic upgrade 때만 사용)
CREATE USER IF NOT EXISTS 'trader_migrate'@'172.26.%' IDENTIFIED BY '<MIGRATE_PASSWORD>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES
  ON trader.* TO 'trader_migrate'@'172.26.%';

-- 2) 엔진: 데이터 읽기·쓰기만 (DDL 없음). GET_LOCK(단일 인스턴스 락)은 별도 권한이 필요 없다
CREATE USER IF NOT EXISTS 'trader_app'@'172.26.%' IDENTIFIED BY '<APP_PASSWORD>';
GRANT SELECT, INSERT, UPDATE, DELETE ON trader.* TO 'trader_app'@'172.26.%';

-- 3) 대시보드(5단계): 읽기 전용
CREATE USER IF NOT EXISTS 'trader_web'@'172.26.%' IDENTIFIED BY '<WEB_PASSWORD>';
GRANT SELECT ON trader.* TO 'trader_web'@'172.26.%';

-- 확인
SHOW GRANTS FOR 'trader_migrate'@'172.26.%';
SHOW GRANTS FOR 'trader_app'@'172.26.%';
SHOW GRANTS FOR 'trader_web'@'172.26.%';
