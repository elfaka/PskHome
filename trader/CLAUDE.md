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
│   │   ├── stocksim_client.py  # 백엔드 stocksim 읽기 전용(GET) 클라이언트 — 엔진의 유일한 네트워크 모듈
│   │   ├── stocksim_feed.py    # 실시세(체결·호가) 폴링 → Quote
│   │   └── context.py          # 시장 맥락: 코스피·VIX·장중 수급·상하한가 (지연 데이터, 시각 포함)
│   ├── indicators.py      # RSI·ATR·MACD·VWAP·SMA20·거래량 비율 (Decimal)
│   ├── performance.py     # 신호 성과 평가 (5·15·30분·장마감)
│   ├── scoring/           # 점수 결합 구조 (아래 그림): price · context · issue · combine
│   ├── strategy/          # Strategy 프로토콜(신호 5종), ma_cross(주문), intraday_score(그림자, scoring 조합)
│   ├── risk/              # approval(승인 증표), manager, killswitch, health
│   ├── execution/gateway.py  # 주문이 브로커로 가는 유일한 경로
│   ├── storage/           # models(테이블), store(SqlTradingStore), db(엔진·인스턴스 락)
│   ├── control.py         # 화면 제어: 설정 덮어쓰기·전략 스위치 반영, 적용값·상태 신호 기록 (engine_state)
│   ├── recovery.py        # 재시작 복구
│   ├── engine.py          # 시세 루프·체결 루프·감시 루프
│   ├── app.py             # 설정 → 엔진 조립, 스키마 버전 확인
│   └── cli.py             # trader run | halt | resume | status
├── migrations/            # Alembic (스키마 변경은 여기로만)
├── db/create_users.sql    # 운영 계정 SQL — 작성만, 실행은 사용자
├── db/dev-init/           # 로컬 컨테이너 초기화
└── tests/                 # *_mysql.py 는 로컬 MySQL 필요
```

흐름: 시세 → 봉·지표 → 전략 판단(`strategy_decisions` 기록) → `RiskManager`(손절·목표가 계산) → `OrderGateway`(PENDING_NEW 선기록) → `Broker`.

- **최종 목표는 자동 주문**이다 (사용자 결정, 2026-11-26). 지금은 가상 체결(PaperBroker)로 자동 주문한다.
- **시세 출처**: 테스트·운영은 `feed=stocksim` — 백엔드 stocksim 공개 API 를 거친 토스 실시세(읽기 전용).
  엔진은 토스 키를 갖지 않는다. 개발 PC 는 `https://elfaka.kr`, 운영은 `http://pskhome-be-1:8080`.
  stocksim 의 주문 API(세션 메모리·수수료 없음·중복 방지 없음)는 쓰지 않고, 체결은 PaperBroker 가 한다.
- **신호** BUY / SELL / HOLD / WAIT / EXIT. 주문하는 전략은 하나, 나머지는 그림자(신호·성과만).
- **장중 규칙**: 15:00 이후 신규 매수 금지, 15:15 보유분 청산, 손절·목표가 도달 시 규칙 청산 (전략·AI 를 거치지 않는다).

### 점수 결합 구조 (`scoring/`)

```
차트 데이터   → 가격 점수 (PriceScorer: 지금 RulePriceScorer, 4단계 ML)   30 ─┐
수급·지수·VIX → 맥락 점수 (RuleContextScorer)                             60 ─┼→ 결합 규칙 → 위험 관리 → 주문
뉴스·공시     → 이슈 점수 (IssueScorer: 지금 NoIssueScorer, 3단계 LLM)    10 ─┘
```

- 공급부는 `IntradayScore(price=..., issue=...)` 로 바꿔 끼운다. 판단 기록 `inputs.components` 에 출처·모델 버전·점수가 남는다.
- 결합 규칙(`combine.py`): 이슈 **거부권** → 매수 금지 + 보유분 EXIT. 이슈 공급부 **실패·지연(FAILED/STALE)** → 신규 매수만 금지.
  가격 점수가 없거나 공급부가 예외를 내면 매수하지 않는다. 데이터 없는 항목은 0점.
- ML·LLM 공급부는 `score()`·`latest()` 안에서 네트워크를 부르지 않는다. LLM 은 별도 작업이 판단을 만들어 두고 `latest()` 는 읽기만 한다.
- **그림자 전략은 자기 가상 보유만 본다** (`Engine.shadow_pos`, 거래일마다 초기화, 재시작 시 오늘의 그림자 신호 `inputs.signal_qty` 로 복원).
  실제 계좌 보유를 보여 주면 남이 산 것을 EXIT 해서 신호 성과가 왜곡된다 (대시보드 확인 중 발견해 고침).
- 손절·목표가는 호가 자릿수로 맞춘다 (손절 올림, 목표 내림).

### 대시보드와 화면 제어

`/trader` (로그인 + 2단계 인증) — 백엔드가 이 DB 를 `trader_web` 으로 읽어 보여준다. 엔진과 직접 통신하지 않는다.
**스키마를 바꾸면 `backend/src/modules/trader/traderDashboard.service.ts`·`traderStatus.service.ts`·`traderCharts.service.ts` 도 함께 고친다.**
화면 그래프가 읽는 것: 판단 기록 `inputs.indicators`(VWAP·SMA20·RSI 등)·`inputs.components`·`inputs.parts`, `risk_reason` 의 `"코드: 메시지"` 형식,
결합 규칙 기준(80/65/30 — 백엔드 `SCORE_THRESHOLDS`). 이 형식이나 기준을 바꾸면 백엔드도 같이 바꾼다.

화면 조작은 `engine_state`(키-값) 를 거친다. 엔진은 감시 루프(`health_check_seconds`, 기본 5초)마다 읽는다.

| 키 | 쓰는 쪽 | 내용 |
|---|---|---|
| `killswitch` | 웹·CLI | `{halted, reason, at}` — 긴급 정지·재개 |
| `strategy_switches` | 웹 | `{version, values: {전략: bool}}` — 꺼진 전략은 **신규 매수만** 안 한다 (매도·청산·규칙 청산은 그대로) |
| `settings_overrides` | 웹 | `{version, values}` — `control.TUNABLE` 만. 엔진이 Settings 검증을 다시 통과시킨 뒤 다음 판단부터 적용 |
| `settings_effective` | 엔진 | trader.env 기본값·덮어쓰기·적용값·거부 사유·바꿀 수 없는 설정(info) |
| `heartbeat` | 엔진 | 상태 신호 (DB·킬스위치·데이터 이상·마지막 시세·전략). 30초 넘게 없으면 화면이 "응답 없음" |

- 바꿀 수 있는 설정(`TUNABLE`): 수수료·세율·원 단위 처리·슬리피지·체결 비율·1회 매수 금액·위험 한도 3종·ATR 배수·최소 손익비·최대 스프레드.
  목록은 백엔드 `traderControl.service.ts` 의 `TUNABLE_RULES`, 프론트 `lib/trader/settingsMeta.ts` 와 같아야 한다.
- 덮어쓰기 검증에 실패하면 이전 값을 유지하고 `SETTINGS_REJECTED` 를 남긴다. 적용하면 `SETTINGS_APPLIED`(바뀐 값).
- 웹 조작은 `risk_events` 에 HALT/RESUME/STRATEGY_ON/OFF/SETTINGS_CHANGE 로 남는다 (`by` = `web:<아이디>`).
- 웹 계정 `trader_web` 의 쓰기 권한은 `engine_state`(INSERT·UPDATE)·`risk_events`(INSERT)뿐 (`db/grant_web_control.sql`).

## 안전 규칙 (깨면 안 된다)

1. **실주문 코드를 쓰지 않는다** (1단계). `TRADER_MODE` 는 `paper` 만 허용한다.
   네트워크는 `marketdata/stocksim_client.py` 에서만, GET 만 쓴다. 주문·초기화 경로 문자열과 GET 외 메서드는 테스트가 막는다.
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
13. 킬스위치는 DB(`engine_state`)에 있고 사람만 끈다 (CLI `trader resume` 또는 웹 — 웹은 2단계 인증 필수). 켜지면 미체결 일괄 취소. 상태를 못 읽으면 켜진 것으로 본다.
    웹에서 위험이 커지는 조작(재개·전략 켜기·설정 변경)은 2단계 인증, 줄이는 조작(긴급 정지·전략 끄기)은 인증 없이 된다.
14. 복구 중 DB·브로커 불일치가 있으면 킬스위치를 켠 채로 뜬다.
15. **손절·목표가는 위험 관리가 ATR 로 정한다** (전략·AI 가 아니다). 비용(수수료·세금·슬리피지) 차감 손익비가 기준 미만이거나
    ATR 이 없으면 매수하지 않는다. 손절·목표가·장마감 청산은 규칙으로 실행한다.
16. **보유분을 줄이는 매도**는 1회 금액·하루 손실·진입 마감·스프레드·데이터 이상으로 막지 않는다(청산을 막으면 더 위험).
    킬스위치·DB/엔진 오류·오래된 시세·장 시간·수량 검사는 그대로다.
17. 지연·집계 데이터(수급·지수·VIX)는 데이터 시각과 함께 다루고, 오래되면 쓰지 않는다(점수 0).
18. 상·하한가를 주는 공급부(stocksim)인데 값이 없으면 매수하지 않는다.

## 작업 규칙

- 단위마다 `uv run ruff check . ; uv run ruff format --check . ; uv run mypy ; uv run pytest -q` 를 돌린다 (로컬 MySQL 컨테이너 필요).
- 스키마를 바꾸면 Alembic 마이그레이션 + `SCHEMA_REVISION` + 테스트.
- `alembic.ini` 는 ASCII 만 (Windows 한글 로캘에서 cp949 로 읽힌다).
- Git Bash 에서 `docker run` 에 `/tmp` 같은 경로를 넘길 때는 `MSYS_NO_PATHCONV=1`.

## 알려진 사실 (테스트로 확인)

- 1분봉 ATR 기준 1.5×/3× 손절·목표가는 매도세·수수료·슬리피지를 빼면 손익비가 0.8~1.1 로 나와
  기본 기준(1.5)에서 매수가 거의 막힌다. 배수·봉 주기·기준 조정은 신호 성과를 보고 사용자와 정한다.
- stocksim 체결 목록은 최근 50건이라 바쁜 종목은 폴링 사이 체결을 놓친다 → 틱 거래량이 작게 잡혀 부분 체결이 보수적이다.
- 장 마감 후에도 stocksim 에 체결이 들어온다(시간외 거래로 보임). 장 시간 규칙이 주문을 막는다.

## 이후 단계 (설계에만 반영)

- **실계좌 자동 주문 전환 조건 (2단계에서 구현)**: `TRADER_MODE=live` 를 새로 만들 때
  ① 별도 확인 설정값이 있어야만 기동, ② 소액 한도(1회·종목·하루 손실)를 가상매매보다 낮게,
  ③ 가상매매로 몇 주 이상 신호 성과·비용 차감 수익을 확인한 뒤, ④ 킬스위치·복구·재동기화가 실계좌에서 검증된 뒤.
  이 조건을 사용자 승인 없이 완화하지 않는다.

- **2단계 TossBroker**: `Broker` 프로토콜 구현. 착수 전에 https://openapi.tossinvest.com/openapi-docs/overview.md 최신 문서를 다시 확인한다.
  OAuth 토큰은 클라이언트당 1개라 엔진 한 곳(단일 인스턴스)에서만 발급·갱신한다 — 백엔드 `stocksim` 과 같은 키를 쓰면 서로 토큰을 밀어낸다.
  허용 IP 등록, API 그룹별 호출 한도, 웹소켓 재연결 후 `list_open_orders`/`get_order` 로 주문 재동기화.
  접수 여부가 불확실한 주문은 `BrokerError(uncertain=True)` → 엔진 중지 → 복구에서 client_order_id 로 조회.
  clientOrderId 형식·길이 제한은 **확인 필요** (내부 ID 는 64자 이하).
  토스 사양 중 다른 대화에서 나온 것(모두 확인 필요): 웹소켓 동시 연결 2개·연결당 구독 100건, 그룹별 호출 한도(예: 초당 주문 10회),
  과거 시세는 1분봉·일봉, 공식 모의투자 없음. 서버 공인 IP 변경 감지·NTP 시간 동기화도 운영 점검 항목.
- **3단계 LLM** (뉴스·공시 OpenDART): 처음엔 기록만, 매수 신호보다 **위험 종목 걸러내기**부터.
  - 점수 전략의 뉴스(10점) 자리에 들어간다. 5분 주기 + 이벤트(급등락·거래량 급증·수급 반전·중요 공시) 때 호출.
  - 응답은 정해진 JSON 스키마(Structured Outputs 등)로 받고, 형식 오류·지연·실패는 HOLD/WAIT.
  - 입력·응답·모델 버전·이후 결과를 모두 기록. 뉴스 본문에 섞인 지시문(프롬프트 인젝션)을 데이터로만 다룬다.
  - 과거 데이터 백테스트는 LLM 이 결과를 이미 알 수 있어(미래 정보 유입) 실제보다 좋게 나올 수 있다.
  - 모델 선택(다른 대화의 `gpt-6.2-sol`·`gpt-6-luna`·`gpt-6.2-astra` 등)은 착수 때 공식 문서로 확인한다.
- **4단계 LightGBM**: 시간 순서 분할 검증. 규칙만 / +LLM / +ML 을 가상매매로 비교(`strategy_id`·그림자 전략으로 구분),
  지표는 적중률이 아니라 거래당 기대수익·MDD·손익비·비용 차감 후 수익.
- **종목 스캐너** (2단계 이후): 거래대금·변동성으로 1차 후보 → 상위 10~20개 → 점수 → 최종 후보.
- **알림** (5단계): 체결·오류·엔진 중단을 텔레그램 등으로.
- AI 는 점수·의견만 낸다. 주문 여부·금액은 규칙 코드(전략 + RiskManager)가 정한다. AI 에 API 키·브로커·게이트웨이를 주지 않는다.
  AI 실패 시 매매하지 않는다.
- **대시보드** (완료): 프론트 `/trader`(로그인 + TOTP) + 백엔드 `/api/trader/**`. 위 "대시보드와 화면 제어" 참고.
