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
구현 시작 전 **반드시** `.harness/context.md` 를 먼저 작성한다.
하네스 에이전트가 이 파일을 읽어 코드 구조만으로는 알 수 없는 비즈니스 의도를 테스트에 반영한다.

**`.harness/context.md` 작성 형식:**
```markdown
## 기능명
(예: 캘린더 기능)

## 목적
(예: 사용자별 일정 CRUD)

## 비즈니스 규칙
- (예: 과거 날짜 이벤트 생성 불가)
- (예: 동일 시간대 중복 이벤트 불가)
- (예: 본인 일정만 수정·삭제 가능)

## 인증/권한
- (예: 인증 필요 / 불필요, 역할 기반 등)

## 연동 모듈
- (예: survey 모듈의 Google 로그인 세션 재사용)

## 제약·예외
- (예: 하루 최대 10개 이벤트)
```

구현 완료(Phase 4) 후에는 `.harness/context.md` 내용을 비워 다음 기능 작업에 영향을 주지 않도록 한다.

각 구현 단계 완료 후 아래 검증 수행 후 커밋:

**백엔드:**
```bash
# 전체 테스트 (외부 의존 없음 — MySQL/Redis/Google 불필요)
cd backend && npm test

# 모듈별 빠른 테스트 (변경한 모듈만)
cd backend && npx vitest run src/modules/jsonprettier
cd backend && npx vitest run src/modules/pspost

cd backend && npm run lint
cd backend && npm run build
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

### 백엔드 (Express 5 + TypeScript, Node 22)
```bash
# 의존성 설치
cd backend && npm install

# 로컬 실행 (로컬 MySQL + Redis 필요, 파일 변경 시 자동 재시작)
cd backend && npm run dev

# 프로덕션 빌드 (prisma generate + tsc, 출력: backend/dist/)
cd backend && npm run build

# 빌드 결과 실행
cd backend && npm start

# 테스트 (외부 의존 없음)
cd backend && npm test

# 단일 테스트 파일
cd backend && npx vitest run src/modules/pspost/psPost.service.test.ts

# Prisma
cd backend && npm run prisma:generate   # 클라이언트 재생성
cd backend && npm run prisma:pull       # 실제 DB 스키마와 대조(introspect)
```

환경변수는 `backend/.env` 에 둔다. 템플릿은 [`backend/.env.example`](backend/.env.example).

### 프론트엔드 (Next.js App Router + TypeScript)
```bash
# 개발 서버 (localhost:5173, /api → localhost:8080 프록시)
cd frontend && npm run dev

# 프로덕션 빌드 (standalone 출력: frontend/.next/standalone)
cd frontend && npm run build

# 빌드 결과 실행
cd frontend && npm start

# 린트
cd frontend && npm run lint

# 테스트 (Vitest + MSW, 서버 불필요)
cd frontend && npm run test

# 테스트 watch 모드
cd frontend && npm run test:watch
```

### 인프라 (Docker Compose)
```bash
# DB 시작 (MySQL:3306) + 캐시 (Redis:6379)
cd server && docker compose -f docker-compose-db.yaml up -d

# 백엔드 시작 (이미지 빌드 포함, :8080)
cd server && docker compose -f docker-compose-be.yaml up -d --build

# 프론트엔드 시작 (이미지 빌드 포함, :5173)
cd server && docker compose -f docker-compose-fe.yaml up -d --build
```
세 compose 파일 모두 `traefik`이라는 Docker 네트워크를 공유합니다.

백엔드/프론트엔드는 stock 이미지에 산출물을 볼륨으로 물리는 방식이 아니라
**각자 dockerfile 로 이미지를 빌드**합니다 (Node 앱은 실행에 `node_modules` 가 필요).
레지스트리는 쓰지 않고 배포 서버에서 직접 빌드합니다.

---

## 아키텍처

### 백엔드 (`backend/src/`)

Express 5 + TypeScript(NodeNext ESM) 앱. 모듈:

- **`modules/jsonprettier/`** — `/api/json/**` 에 노출된 stateless JSON 포맷 서비스 (인증 불필요).
- **`modules/pspost/`** — Prisma 로 MySQL 에 저장되는 게시글 CRUD. 엔드포인트 `/api/posts/**` 는 공개.
  응답은 Spring Data `Page<T>` 형태를 그대로 유지한다 (`lib/page.ts`).
- **`modules/survey/`** — Google Forms/Drive 연동. `passport-google-oauth20` 세션 로그인.
  OAuth2 엔드포인트: `/api/oauth2/**`, `/api/login/oauth2/**`.
  로그인 성공 시 `APP_LOGIN_SUCCESS_REDIRECT` 로 리다이렉트.
- **`app.ts`** — 미들웨어/라우터 조립. **공개/인증 경계가 여기서 결정된다.**
  인증이 필요한 라우터만 `middleware/requireAuth.ts` 를 붙인다.
  공개: `/api/ping`, `/api/auth/me`, `/api/auth/logout`, `/api/json/**`, `/api/posts/**`, OAuth2 flow.
  인증 필요: `/api/forms/**`.

**설정:** 프로파일 대신 `.env` + `config/env.ts`(zod 스키마) 하나로 관리한다.
시크릿은 전부 optional 이라, 없더라도 앱은 기동되고 해당 엔드포인트만 실패한다.

**세션:** `express-session` + `connect-redis`. `NODE_ENV=test` 면 Redis 대신 MemoryStore.

### 프론트엔드 (`frontend/src/`)

Next.js App Router SPA. 최상위 라우트 3개:
- `/`, `/about`, `/project`, `/pspost/**` → `app/(home)/`
- `/googleform/**` → `app/googleform/`
- `/jsonprettier` → `app/jsonprettier/`

라우트 페이지는 얇게 유지하고 화면 구현은 `src/components/` 에 둔다.

개발 서버는 `next.config.ts` 의 `rewrites` 로 `/api` 를 `http://localhost:8080` 에 프록시한다.
프로덕션 빌드는 standalone Node 서버로 실행한다.

API 호출은 `src/api/` 폴더에 기능별로 구성(`pspost.ts`, `jsonPrettierApi.ts`, `client.ts`).
