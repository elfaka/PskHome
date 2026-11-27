# trader — 개인용 주식 자동매매 엔진 (1단계: 가상매매)

본인만 쓰는 자동매매 엔진이다. 지금은 **가상매매(PaperBroker)만** 있고 실제 증권사 연결·실주문 코드는 없다.

```
시세(Feed) ─▶ 봉 집계 ─▶ 전략 판단(기록) ─▶ 위험 관리(승인) ─▶ 주문 게이트웨이(DB 선기록) ─▶ Broker
                                                                                   └─ PaperBroker (지금)
                                                                                   └─ TossBroker  (2단계)
```

- 엔진: Python 3.12, SQLAlchemy + Alembic, MySQL 8.0.46, pytest
- 화면: `https://elfaka.kr/trader` (본인 ID/비밀번호 로그인, 지금은 "준비 중"). 백엔드·프론트는 저장소 루트의 `backend/`·`frontend/`

## 빠른 시작 (내 PC)

준비: [uv](https://docs.astral.sh/uv/), Docker Desktop

```powershell
cd trader
Copy-Item .env.example .env      # DEV_* 비밀번호, 수수료·세율·위험 한도를 채운다
docker compose -f compose.dev.yaml up -d db
uv sync
uv run alembic upgrade head      # trader_migrate 계정으로 스키마 적용
uv run trader run                # 기본: 모의 생성 시세, fast(가상 시계로 하루치 재생)
uv run trader status
```

- 로컬 MySQL 은 `127.0.0.1:3307` 에만 열린다. 최초 기동 때 `db/dev-init/01-users.sh` 가 `trader`·`trader_test` DB 와 개발용 계정을 만든다.
- **운영 DB 에는 접속하지 않는다.** 개발·테스트는 이 컨테이너만 쓴다.
- CSV 재생: `TRADER_FEED=csv`, `TRADER_FEED_CSV_PATH=data/sample_ticks.csv` (모의 생성으로 만든 예시 데이터. 실제 시세 아님)

### 실시세로 테스트 (stocksim)

기존 주식 모의투자(`/stocksim`)의 백엔드가 받는 **토스 실시세**를 엔진이 읽어 가상매매한다.
엔진은 토스 키가 없고 GET 만 한다. 체결은 엔진의 PaperBroker(수수료·세금·슬리피지·DB 기록·복구)가 한다.

```powershell
# .env 에서
#   TRADER_FEED=stocksim
#   TRADER_PACE=realtime
#   TRADER_STOCKSIM_BASE_URL=https://elfaka.kr   (개발 PC 는 운영 공개 API)
uv run trader run
```

- 평일 08:55~15:35(KST)에만 폴링한다. 장 시간(09:00~15:20) 밖에서는 시세가 들어와도 주문하지 않는다.
- 로컬에서 같은 토스 키로 백엔드를 띄우지 않는다 (운영 토큰이 밀려난다).
- 결과 보기 (개발 DB):
  ```sql
  -- 전략 판단과 위험 관리 결과
  SELECT ts, strategy_id, symbol, action, score, risk_result, risk_reason, entry_price, stop_loss, take_profit, risk_reward
  FROM strategy_decisions ORDER BY id DESC LIMIT 50;
  -- 신호 성과 (방향 반영 수익률)
  SELECT d.strategy_id, p.horizon, COUNT(*), AVG(p.return_pct), AVG(p.mfe_pct), AVG(p.mae_pct)
  FROM signal_performance p JOIN strategy_decisions d ON d.id = p.decision_id
  WHERE p.status = 'DONE' GROUP BY d.strategy_id, p.horizon;
  ```

### 전략과 신호

| 전략 | 역할 | 내용 |
|---|---|---|
| `ma_cross` | 주문 | 1분봉 이동평균 교차 (예시) |
| `intraday_score` | 그림자 | 100점: 기술30·수급25·시장20·글로벌(VIX)15·뉴스10(3단계). 없는 항목 0점. 80↑ + VWAP 위 + 거래량 1.5배 → BUY |

- 신호: BUY / SELL / HOLD / WAIT / EXIT. 그림자 전략은 주문하지 않고 신호와 성과만 남긴다.
- 매수 시 위험 관리가 **ATR 손절·목표가**를 정하고, 비용 차감 손익비가 `TRADER_RISK_MIN_RISK_REWARD` 미만이면 막는다.
- 손절·목표가 도달, 15:15(`TRADER_EOD_EXIT`)에는 규칙으로 청산한다. 15:00(`TRADER_ENTRY_CUTOFF`) 이후 신규 매수 금지.
- 신호마다 5·15·30분·장마감 성과(`signal_performance`)를 기록한다.

> 1분봉 ATR 은 작아서 매도세·수수료를 빼면 손익비가 1 안팎이다. 기본값(1.5)이면 `ma_cross` 매수가 거의 막힌다.
> 배수·봉 주기·기준은 성과 기록을 보고 정한다.

### 대시보드 (`/trader`)

로그인하면 엔진 DB 를 읽기 전용으로 보여준다 (10초마다 새로고침). 평가금액·현금·오늘 손익·킬스위치 상태, 보유 종목,
판단 기록(점수 구성: 가격·맥락·이슈 / 위험 관리 결과 / 진입·손절·목표), 신호 성과, 주문·체결, 위험 이벤트.
화면에서 주문하거나 킬스위치를 조작하지는 않는다 (`trader halt` 는 서버에서).

로컬에서 보려면 `backend/.env` 에 `TRADER_DATABASE_URL=mysql://trader_web:<DEV_TRADER_WEB_PASSWORD>@127.0.0.1:3307/trader`
와 `TRADER_ADMIN_USERNAME`/`TRADER_ADMIN_PASSWORD_HASH` 를 넣고 백엔드·프론트를 띄운다.
(이미 만들어 둔 로컬 MySQL 이면 `trader_web` 계정을 직접 만든다 — 초기화 스크립트는 최초 기동 때만 돈다)

### 명령

| 명령 | 하는 일 |
|---|---|
| `trader run` | 엔진 실행. 시작 시 재시작 복구 → 시세 처리. `Ctrl+C`/SIGTERM 으로 정상 종료 |
| `trader halt --reason "..."` | **즉시 중지(킬스위치)**: 신규 주문 차단 + 실행 중인 엔진이 미체결 주문 일괄 취소. 재시작해도 유지 |
| `trader resume` | 킬스위치 해제 (사람만 한다) |
| `trader status` | 현금·포지션·미체결·킬스위치 상태 (JSON) |

## 테스트

```powershell
cd trader
uv run pytest -q                 # MySQL 테스트 포함 (TRADER_TEST_DATABASE_URL 이 없으면 그 테스트만 건너뜀)
uv run ruff check . ; uv run ruff format --check . ; uv run mypy
```

- MySQL 테스트는 `trader_test` DB 를 매 세션 `base → head` 로 실제 마이그레이션하고, 테스트마다 비운다.
  DB 이름이 `_test` 로 끝나지 않으면 테스트가 거부한다 (개발·운영 DB 보호).
- 주요 시나리오: 장 하루 전체 실행 후 DB 정합성, **중간에 죽고 재시작한 결과 = 중단 없이 실행한 결과**(주문·체결·현금·포지션),
  PENDING_NEW 주문 정리, 복구 불일치 시 중지, 킬스위치 일괄 취소, DB 장애 시 무주문, 데이터 누락 감지,
  주문 우회 경로 정적 검사.

## DB 설정 (운영)

운영 MySQL(`pskhome-db-1`, 8.0.46)을 같이 쓰되 **전용 DB `trader` 와 최소 권한 계정**만 쓴다. 다른 DB·컨테이너·볼륨은 건드리지 않는다.

1. `db/create_users.sql` 의 `<...>` 비밀번호 3개를 서로 다른 긴 임의 문자열로 바꾼다.
2. 서버에서 **직접** 실행한다.
   ```bash
   docker exec -i pskhome-db-1 mysql -uroot -p < create_users.sql
   ```
   | 계정 | 권한 | 용도 |
   |---|---|---|
   | `trader_migrate@172.26.%` | `trader.*` DDL + DML | `alembic upgrade` 때만 |
   | `trader_app@172.26.%` | `trader.*` SELECT/INSERT/UPDATE/DELETE | 엔진 |
   | `trader_web@172.26.%` | `trader.*` SELECT | 5단계 대시보드 |

   `172.26.%` 는 Docker 네트워크 `traefik`(172.26.0.0/16)이다. 3306 이 호스트에 열려 있어도 이 계정들은 밖에서 못 붙는다.
3. 서버에 `server/trader.env` 를 만든다 (`server/trader.env.example` 참고). git 에 올리지 않는다.
   수수료·한도 같은 운영 설정은 엔진이 처음 기동할 때 한 번 DB 로 옮기고, 그 뒤로는 `/trader` → 설정에서 바꾼다 (trader.env 의 같은 값은 무시된다).

## 마이그레이션

```powershell
# 로컬
cd trader ; uv run alembic upgrade head
# 새 마이그레이션 (모델 수정 후)
uv run alembic revision --autogenerate -m "설명"   # 생성 파일을 반드시 읽고 고친다
```

- 새 마이그레이션을 추가하면 `src/trader/storage/models.py` 의 `SCHEMA_REVISION` 도 올린다.
  엔진은 DB 스키마 버전이 이 값과 다르면 기동하지 않는다 (테스트가 head 와 비교한다).
- 운영: `docker compose -f docker-compose-trader.yaml --profile migrate run --rm migrate`

## 운영 배포

- `main` 에 `trader/**` 가 바뀌면 GitHub Actions(`.github/workflows/trader-cd.yaml`)가 테스트(MySQL 8.0.46) 후
  `ghcr.io/elfaka/pskhome-trader` 이미지를 올린다.
- **서버 배포는 수동이다.** Actions 에서 "Trader Engine" → Run workflow → `deploy` 체크.
  `server/trader.env` 가 없으면 실패한다. 마이그레이션 → 엔진 재기동 순서로 돈다.
- 엔진 컨테이너(`pskhome-trader-1`)는 포트를 열지 않고, 읽기 전용 파일시스템·비루트 사용자로 돈다.
- 엔진이 기록과 실제가 어긋날 수 있는 오류로 멈추면 exit 2 → 재시작 → 복구. 복구 중 불일치가 있으면 킬스위치를 켠 채로 뜬다
  (`trader status` 로 확인하고 `trader resume`).

### /trader 로그인 설정 (백엔드)

```powershell
cd backend ; npm run trader:hash-password   # 비밀번호를 입력하면 해시가 나온다
```
GitHub Secrets 에 `TRADER_ADMIN_USERNAME`, `TRADER_ADMIN_PASSWORD_HASH` 를 넣으면 백엔드 배포가 서버 `.env` 에 쓴다.
없으면 로그인은 항상 실패한다.

## 설정 (.env)

전체 목록은 `.env.example`. **수수료·세율·원 단위 처리·슬리피지·체결 참여율·위험 한도·주문 금액은 기본값이 없다** — 확인한 값을 직접 넣는다.

## 확인 필요 (지어내지 않고 남겨 둔 것)

- 실제 수수료율·거래세율·원 단위 처리 규칙 (설정값으로만 받는다)
- KRX 호가 단위표, 동시호가·휴장일 (지금은 단순 시각 범위 `09:00~15:20` KST 만 본다)
- 토스증권 Open API: clientOrderId 형식·길이, 주문/체결 조회 API, 웹소켓 사양, 호출 한도 — 2단계 착수 때 최신 문서로 확인
- VI 발동 정보 (출처 없음 — 지금은 검사하지 않는다)
- LLM 모델 선택과 사양 (3단계)
