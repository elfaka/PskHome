# CLAUDE.md

이 파일은 Claude Code (claude.ai/code)에게 이 저장소의 코드베이스 작업 방법을 안내합니다.

> 각 서브 모듈의 상세 가이드: [`backend/CLAUDE.md`](backend/CLAUDE.md), [`frontend/CLAUDE.md`](frontend/CLAUDE.md)
> 프로젝트 전체 개요: [`docs/skill.md`](docs/skill.md)

## 에이전트 워크플로우 프로토콜

### Phase 1: 분석 (자동)
- 사용자 의도 파악
- 관련 코드베이스 탐색
- 반드시 읽을 파일: `CLAUDE.md` (루트), `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `docs/skill.md`

### Phase 2: 설계 (자동 → 사용자 승인 필수)
- ExecPlan(구현 계획) 작성 후 사용자에게 제시
- **⚠️ 사용자 승인 없이 구현 시작 금지**

### Phase 3: 구현 (단계별 체크포인트)
각 구현 단계 완료 후 아래 검증 수행 후 커밋:

**백엔드:**
```bash
# 전체 테스트
cd backend && ./gradlew test

# 모듈별 빠른 테스트 (변경한 모듈만)
cd backend && ./gradlew test --tests "kr.elfaka.lostark.jsonprettier.*"
cd backend && ./gradlew test --tests "kr.elfaka.lostark.pspost.*"
```

**프론트엔드:**
```bash
cd frontend && npm run lint
cd frontend && npm run build
cd frontend && npm run test
```

### Phase 4: 검증 보고
- 완료 기준(수락 조건) 체크
- 변경 사항 최종 요약 보고

---

## 명령어

### 백엔드 (Spring Boot + Gradle, Java 21)
```bash
# 로컬 실행 (로컬 MySQL + Redis 필요)
cd backend && ./gradlew bootRun --args='--spring.profiles.active=local'

# JAR 빌드 (출력: backend/build/libs/*.jar)
cd backend && ./gradlew build

# 테스트 실행 (H2 인메모리, MySQL/Redis 불필요)
cd backend && ./gradlew test

# 단일 테스트 클래스 실행
cd backend && ./gradlew test --tests "kr.elfaka.lostark.SomeTest"
```

### 프론트엔드 (React + Vite)
```bash
# 개발 서버 실행 (브라우저 자동 열림, /api → localhost:8080 프록시)
cd frontend && npm run dev

# 프로덕션 빌드 (출력: frontend/dist/)
cd frontend && npm run build

# 린트
cd frontend && npm run lint

# 테스트 실행 (Vitest + MSW, 서버 불필요)
cd frontend && npm run test

# 테스트 watch 모드
cd frontend && npm run test:watch
```

### 인프라 (Docker Compose)
```bash
# DB 시작 (MySQL:3306) + 캐시 (Redis:6379)
cd server && docker compose -f docker-compose-db.yaml up -d

# 백엔드 시작 (backend/build/libs/의 JAR 실행)
cd server && docker compose -f docker-compose-be.yaml up -d

# 프론트엔드 시작 (frontend/dist/를 Nginx로 서빙, :5173)
cd server && docker compose -f docker-compose-fe.yaml up -d
```
세 compose 파일 모두 `traefik`이라는 Docker 네트워크를 공유합니다.

---

## 아키텍처

### 백엔드 (`backend/src/main/java/kr/elfaka/lostark/`)

Spring Boot 3 앱, 베이스 패키지 `kr.elfaka.lostark`. 모듈:

- **`character/`** — 외부 LostArk Open API(`https://developer-lostark.game.onstove.com`)를 Spring Cloud OpenFeign(`LostArkFeignClient`)으로 프록시. API 키는 `application-local.yaml`의 `cloud.openfeign.client.config.open-api.default-request-headers.Authorization`에 Jasypt 암호화로 저장.
- **`jsonprettier/`** — `/api/json/**`에 노출된 stateless JSON 포맷 서비스 (인증 불필요).
- **`pspost/`** — Spring Data JPA로 MySQL에 저장되는 게시글 CRUD. 엔드포인트 `/api/posts/**`는 공개.
- **`survey/`** — Google Forms/Sheets 연동. Google 로그인에 Spring Security OAuth2 (세션 기반) 사용. OAuth2 엔드포인트: `/api/oauth2/**`, `/api/login/oauth2/**`. 로그인 성공 시 `app.login-success-redirect`에 설정된 URL로 리다이렉트.
- **`config/SecurityConfig`** — CSRF 비활성화. `/api/**`는 인증 필요, 단 예외: `/api/ping`, `/api/auth/me`, `/api/json/**`, `/api/posts/**`, OAuth2 flow 경로.

**프로파일:** `local` (`application-local.yaml` 사용 — 평문 MySQL 인증, `ddl-auto: update`, `show-sql: true`), `prod` (`application-prod.yaml` 사용, Docker를 통해 환경변수 주입). Jasypt로 시크릿 암호화; 암호화 비밀번호는 `JASYPT_ENCRYPTOR_PASSWORD` 환경변수로 공급.

### 프론트엔드 (`frontend/src/`)

최상위 라우트가 3개인 SPA:
- `/*` → `pages/home/`
- `/googleform/*` → `pages/googleform/`
- `/jsonprettier/*` → `pages/jsonprettier/`

Vite 개발 서버는 `/api`를 `http://localhost:8080`으로 프록시. 프로덕션 빌드는 Nginx로 서빙(`docker-compose-fe.yaml` 참고).

API 호출은 `src/api/` 폴더에 기능별로 구성(`pspost.ts`, `jsonPrettierApi.ts`, `client.ts`).
