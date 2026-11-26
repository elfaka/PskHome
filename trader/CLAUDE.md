# trader/CLAUDE.md — 자동매매 엔진

루트 [`CLAUDE.md`](../CLAUDE.md) 와 함께 본다. 실행·DB·배포 방법은 [`README.md`](README.md).

## 확정된 구조

```
trader/
├── src/trader/
│   ├── config.py          # pydantic-settings, TRADER_* (.env). 수수료·한도는 기본값 없음
│   ├── logging_setup.py   # KST JSON 로그, DB URL 비밀번호·비밀값 마스킹
│   ├── clock.py           # 내부는 tz-aware UTC, 거래일·장시간은 KST, DB 는 naive UTC
│   ├── money.py           # Decimal 헬퍼. float 금지
│   ├── domain.py          # Quote, Bar, OrderRequest/State, Fill, ExecutionEvent, Position
│   ├── broker/base.py     # Broker 프로토콜 (시세·잔고·주문·취소·조회·실시간 구독)
│   ├── broker/paper.py    # PaperBroker (가상 체결)
│   ├── marketdata/        # MarketDataFeed 프로토콜, csv_replay, synthetic, bars(봉 집계·누락)
│   ├── strategy/          # Strategy 프로토콜, ma_cross
│   ├── risk/              # approval(승인 증표), manager, killswitch, health
│   ├── execution/gateway.py  # 주문이 브로커로 가는 유일한 경로
│   ├── storage/           # models(테이블), store(SqlTradingStore), db(엔진·인스턴스 락)
│   ├── recovery.py        # 재시작 복구
│   ├── engine.py          # 시세 루프·체결 루프·감시 루프
│   ├── app.py             # 설정 → 엔진 조립, 스키마 버전 확인
│   └── cli.py             # trader run | halt | resume | status
├── migrations/            # Alembic (스키마 변경은 여기로만)
├── db/create_users.sql    # 운영 계정 SQL — 작성만, 실행은 사용자
├── db/dev-init/           # 로컬 컨테이너 초기화
└── tests/                 # *_mysql.py 는 로컬 MySQL 필요
```

흐름: 시세 → 봉 → 전략 판단(`strategy_decisions` 기록) → `RiskManager` → `OrderGateway`(PENDING_NEW 선기록) → `Broker`.

## 안전 규칙 (깨면 안 된다)

1. **실주문 코드를 쓰지 않는다** (1단계). `TRADER_MODE` 는 `paper` 만 허용한다. 네트워크 클라이언트 import 는 테스트가 막는다.
2. **모든 주문은 위험 관리를 통과한다.** `Broker.place_order` 는 `RiskApproval` 이 있어야 하고(주문 내용 해시·유효시간 검증),
   승인은 `RiskManager` 만 발급한다. `place_order` 호출은 `execution/gateway.py` 에만 있다 (`tests/test_no_bypass.py`).
   새 브로커 구현체도 첫 줄에서 `risk.approval.verify()` 를 호출한다.
3. **전략은 브로커·DB·게이트웨이를 import 하지 않는다.** 판단(`Decision`)만 돌려준다.
4. **client_order_id** 는 (계좌, 전략, 종목, 신호 봉 시각, 방향)에서 결정적으로 만든다. DB 에 UNIQUE. 같은 신호는 두 번 주문되지 않는다.
5. **신규 주문 금지 조건**: 킬스위치, 엔진 오류, DB 장애·기록 실패, 잘못된 시세·봉 누락, 오래된 시세, 장 시간 외,
   한도 초과, 판단 정보 부족(기준 평가금액·시세 없음). 판단 기록이 실패하면 주문하지 않는다.
6. **DB 선기록**: PENDING_NEW 커밋에 실패하면 보내지 않는다. 보낸 뒤 기록에 실패하면 엔진을 멈춘다(exit 2).
   체결 반영(`apply_fill`)은 한 트랜잭션이고 실패하면 엔진을 멈춘다.
7. **금액은 Decimal**(DB `DECIMAL(20,4)`, 수량 `DECIMAL(20,6)`). `money.D()` 는 float 을 거부한다.
8. **시각**: 내부·DB 는 UTC(`DATETIME(6)`), 거래일·장 시간은 Asia/Seoul. naive datetime 은 받지 않는다.
9. **비밀값**은 `.env`/`server/trader.env` 에만. 로그는 마스킹 필터를 거친다. `echo`/`hide_parameters` 를 켜지 않는다.
10. **수수료·세율·한도는 설정값**이고 기본값을 넣지 않는다.
11. **엔진 인스턴스는 1개**: MySQL `GET_LOCK`. 락 연결이 끊기면 엔진을 멈춘다.
12. 운영 MySQL 의 다른 DB·컨테이너·볼륨은 건드리지 않는다. 계정 SQL 실행·운영 배포는 사용자가 한다.
13. 킬스위치는 DB(`engine_state`)에 있고 사람만 끈다. 켜지면 미체결 일괄 취소. 상태를 못 읽으면 켜진 것으로 본다.
14. 복구 중 DB·브로커 불일치가 있으면 킬스위치를 켠 채로 뜬다.

## 작업 규칙

- 단위마다 `uv run ruff check . ; uv run ruff format --check . ; uv run mypy ; uv run pytest -q` 를 돌린다 (로컬 MySQL 컨테이너 필요).
- 스키마를 바꾸면 Alembic 마이그레이션 + `SCHEMA_REVISION` + 테스트.
- `alembic.ini` 는 ASCII 만 (Windows 한글 로캘에서 cp949 로 읽힌다).
- Git Bash 에서 `docker run` 에 `/tmp` 같은 경로를 넘길 때는 `MSYS_NO_PATHCONV=1`.

## 이후 단계 (설계에만 반영)

- **2단계 TossBroker**: `Broker` 프로토콜 구현. 착수 전에 https://openapi.tossinvest.com/openapi-docs/overview.md 최신 문서를 다시 확인한다.
  OAuth 토큰은 클라이언트당 1개라 엔진 한 곳(단일 인스턴스)에서만 발급·갱신한다 — 백엔드 `stocksim` 과 같은 키를 쓰면 서로 토큰을 밀어낸다.
  허용 IP 등록, API 그룹별 호출 한도, 웹소켓 재연결 후 `list_open_orders`/`get_order` 로 주문 재동기화.
  접수 여부가 불확실한 주문은 `BrokerError(uncertain=True)` → 엔진 중지 → 복구에서 client_order_id 로 조회.
  clientOrderId 형식·길이 제한은 **확인 필요** (내부 ID 는 64자 이하).
- **3단계 LLM**: 뉴스·공시(OpenDART) 해석은 기록만. **4단계 LightGBM**: 시간 순서 분할 검증.
- AI 는 점수·의견만 낸다. 주문 여부·금액은 규칙 코드(전략 + RiskManager)가 정한다. AI 에 API 키·브로커·게이트웨이를 주지 않는다.
  AI 실패 시 매매하지 않는다.
- **5단계 대시보드**: 프론트 `/trader`(로그인 게이트 있음) + 백엔드 `/api/trader/**`(requireTraderAuth), DB 는 `trader_web`(SELECT 전용).
