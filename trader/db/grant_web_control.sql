-- ─────────────────────────────────────────────────────────────────────────────
-- /trader 화면 제어(긴급 정지·재개·전략 켜기/끄기·설정 변경)용 추가 권한.
--
-- ⚠️ 사용자가 직접 실행한다. create_users.sql 을 실행했고, 엔진 마이그레이션(테이블 생성)이 끝난 뒤에 실행한다
--    (테이블 단위 GRANT 는 테이블이 있어야 한다).
--
-- 대시보드 계정 trader_web 은 여전히 주문·체결·잔고를 읽기만 한다. 쓰기는 두 테이블뿐이다.
--   engine_state : 킬스위치·전략 스위치·설정 덮어쓰기 (엔진이 약 5초마다 읽어 반영)
--   risk_events  : 누가 언제 무엇을 바꿨는지 기록 (INSERT 만, 수정·삭제 불가)
--
-- 실행 예 (서버에서):
--   docker exec -i pskhome-db-1 mysql -uroot -p < grant_web_control.sql
-- 로컬 개발 DB 는 계정 호스트가 '%' 이다 — 아래 '172.26.%' 를 '%' 로 바꿔 실행한다.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT INSERT, UPDATE ON trader.engine_state TO 'trader_web'@'172.26.%';
GRANT INSERT ON trader.risk_events TO 'trader_web'@'172.26.%';

SHOW GRANTS FOR 'trader_web'@'172.26.%';
