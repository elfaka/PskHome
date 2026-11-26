#!/bin/bash
# 로컬 개발 컨테이너 최초 기동 시 1회 실행된다 (docker-entrypoint-initdb.d).
# 운영용 계정 SQL 은 db/create_users.sql — 그쪽은 사용자가 직접 실행한다.
set -euo pipefail

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS trader      CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS trader_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'trader_migrate'@'%' IDENTIFIED BY '${DEV_TRADER_MIGRATE_PASSWORD}';
CREATE USER IF NOT EXISTS 'trader_app'@'%'     IDENTIFIED BY '${DEV_TRADER_APP_PASSWORD}';
CREATE USER IF NOT EXISTS 'trader_web'@'%'     IDENTIFIED BY '${DEV_TRADER_WEB_PASSWORD}';

-- 마이그레이션 계정: trader 와 테스트 DB 의 DDL/DML
GRANT ALL PRIVILEGES ON trader.*      TO 'trader_migrate'@'%';
GRANT ALL PRIVILEGES ON trader_test.* TO 'trader_migrate'@'%';

-- 엔진 계정: DML 만
GRANT SELECT, INSERT, UPDATE, DELETE ON trader.* TO 'trader_app'@'%';

-- 대시보드(백엔드): 읽기만
GRANT SELECT ON trader.* TO 'trader_web'@'%';
FLUSH PRIVILEGES;
SQL
