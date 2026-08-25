# Backend CLAUDE.md

Express 5 + TypeScript 백엔드 개발 가이드. 루트 [`CLAUDE.md`](../CLAUDE.md)의 명령어와 함께 참고할 것.

## 스택

| 기술 | 용도 |
|------|------|
| Express 5 | HTTP 프레임워크 |
| TypeScript (NodeNext ESM) | 언어 |
| Prisma 7 + `@prisma/adapter-mariadb` | MySQL ORM |
| express-session + connect-redis | 세션 (Redis) |
| Passport (`passport-google-oauth20`) | Google OAuth2 로그인 |
| googleapis | Google Drive v3 / Forms v1 |
| zod | 환경변수 스키마 검증 |
| Vitest + Supertest | 테스트 |

> **ESM 주의:** `"type": "module"` + `moduleResolution: NodeNext` 이므로
> 상대 경로 import 에 **`.js` 확장자를 반드시** 붙인다 (`./foo.service.js`).
> TypeScript 파일을 가리키더라도 확장자는 `.js` 다.

## 모듈 구조

```
src/
├── index.ts                    # 부트스트랩 (listen, graceful shutdown)
├── app.ts                      # createApp() — 미들웨어/라우터 조립
├── config/
│   ├── env.ts                  # zod 환경변수 스키마
│   ├── session.ts              # express-session + Redis store
│   └── passport.ts             # Google OAuth2 전략, scope 정의
├── middleware/
│   ├── requireAuth.ts          # 인증 게이트 (401 JSON)
│   └── errorHandler.ts         # 전역 에러 → JSON, 404 핸들러
├── lib/
│   ├── httpError.ts            # 상태코드를 가진 예외
│   ├── page.ts                 # Spring Data Page 형태 헬퍼
│   └── prisma.ts               # Prisma client (지연 초기화)
├── testing/fakePrisma.ts       # 테스트용 인메모리 psPost 저장소
├── types/express.d.ts          # req.user 타입 확장
└── modules/
    ├── ping/                   # GET /api/ping
    ├── jsonprettier/           # /api/json/**       (공개)
    ├── pspost/                 # /api/posts/**      (공개)
    └── survey/                 # /api/auth/**, /api/oauth2/**, /api/forms/**
```

모듈 내부 구조: `*.router.ts` → `*.service.ts` → `*.types.ts` (+ 필요 시 클라이언트/팩토리)

## 새 모듈 추가 패턴

```
src/modules/newmodule/
├── newModule.router.ts    # Router, 경로만 정의하고 로직은 서비스에 위임
├── newModule.service.ts   # 비즈니스 로직
├── newModule.types.ts     # 요청/응답 DTO 타입
├── newModule.service.test.ts
└── newModule.router.test.ts
```

`src/app.ts` 의 `createApp()` 에서 mount 한다. **공개/인증 구분이 여기서 결정된다:**

```ts
// --- 공개 (인증 불필요) ---
api.use(newModuleRouter);

// --- 인증 필요 ---
api.use(newModuleRouter);   // 라우터 안에서 router.use("/newmodule", requireAuth)
```

## 보안 경계

기존 Spring `SecurityConfig` 의 `permitAll` / `authenticated` 를 그대로 옮긴 것이다.

**공개 (인증 불필요)**
- `GET /api/ping`
- `GET /api/auth/me` — 로그인 전에도 프론트가 호출한다. **절대 401 을 내면 안 된다.**
- `POST /api/auth/logout`
- `/api/json/**`
- `/api/posts/**`
- `/api/oauth2/**`, `/api/login/oauth2/**` (OAuth2 플로우)

**인증 필요 (`requireAuth`)**
- `/api/forms/**`

미인증 요청은 Google 로 리다이렉트하지 않고 **401 JSON** (`{ error: { code: "UNAUTHORIZED" } }`) 을 반환한다.

## OAuth2 경로 (변경 금지)

Google Cloud Console 의 "승인된 리디렉션 URI" 와 묶여 있어서 마음대로 바꾸면 로그인이 깨진다.

| 경로 | 역할 |
|------|------|
| `GET /api/oauth2/authorization/google` | 로그인 시작 (프론트가 `window.location.href` 로 이동) |
| `GET /api/login/oauth2/code/google` | Google 콜백 (인가코드 수신) |

로그인 성공 시 `APP_LOGIN_SUCCESS_REDIRECT` 로 **항상** 리다이렉트한다.

## 환경변수

`.env` (git 제외). 템플릿은 [`.env.example`](.env.example).

| 변수 | 기본값 | 비고 |
|------|--------|------|
| `NODE_ENV` | `development` | `test` 면 Redis 대신 MemoryStore 사용 |
| `PORT` | `8080` | |
| `DATABASE_URL` | (없음) | `mysql://user:pass@host:3306/page` |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | 세션 저장소 |
| `SESSION_SECRET` | 개발용 기본값 | **운영에서는 반드시 지정** |
| `SESSION_COOKIE_NAME` | `psk.sid` | |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | (없음) | 없으면 로그인 경로만 503 |
| `GOOGLE_CALLBACK_URL` | `http://localhost:8080/api/login/oauth2/code/google` | Console 등록값과 일치해야 함 |
| `APP_LOGIN_SUCCESS_REDIRECT` | `http://localhost:5173/googleform/forms` | |

**시크릿은 전부 optional 이다.** 하나가 없다고 프로세스 부팅을 막지 않고,
해당 시크릿을 쓰는 엔드포인트만 런타임에 실패한다.
(예: Google 시크릿이 없어도 JSON Prettier / PS Post 는 동작한다)

## 데이터베이스

`prisma/schema.prisma` 는 **기존 MySQL 테이블을 매핑만** 한다.
운영 DB 는 기존에 Hibernate `ddl-auto: validate` 로 운영되었고 테이블이 이미 존재하므로,
여기서 마이그레이션을 만들어 적용하지 않는다.

```bash
# 실제 DB 와 스키마가 어긋나는지 확인 (introspect)
cd backend && npm run prisma:pull

# 클라이언트 재생성 (schema.prisma 를 고쳤을 때)
cd backend && npm run prisma:generate
```

> Prisma 7 부터 접속 URL 은 `schema.prisma` 가 아니라 `prisma.config.ts` 에서 관리한다.
> 런타임 접속은 `src/lib/prisma.ts` 의 MariaDB driver adapter 가 담당한다.

## 테스트

```bash
# 전체 (외부 의존 없음 — MySQL/Redis/Google 불필요)
# pretest 훅이 prisma generate 를 먼저 돌리므로 클린 체크아웃에서도 바로 동작한다.
cd backend && npm test

# 모듈별 빠른 테스트
cd backend && npx vitest run src/modules/jsonprettier
cd backend && npx vitest run src/modules/pspost

# 단일 파일
cd backend && npx vitest run src/modules/pspost/psPost.service.test.ts

# watch 모드
cd backend && npm run test:watch
```

**테스트는 반드시 외부 의존 없이 돌아야 한다.**
- DB: `vi.mock("../../lib/prisma.js")` + `src/testing/fakePrisma.ts` (기존 H2 역할)
- Google: `vi.mock("./google/googleClientFactory.js")`
- 세션: `NODE_ENV=test` 면 `config/session.ts` 가 Redis 대신 MemoryStore 를 쓴다
  (`vitest.config.ts` 가 `NODE_ENV=test` 를 강제한다)

## 공통 실수 패턴

### 1. 상대 경로 import 에 `.js` 확장자 누락

ESM + NodeNext 이므로 확장자가 없으면 런타임에 모듈을 못 찾는다.
`import { foo } from "./foo.service"` (X) → `"./foo.service.js"` (O)

### 2. `vi.mock` 대상 경로도 `.js`

```ts
vi.mock("../../lib/prisma.js", () => ({ getPrisma: () => fake }));
```
`.js` 를 빼면 mock 이 적용되지 않고 실제 DB 에 붙으려 한다.

### 3. `vi.mock` 은 hoist 된다

mock 팩토리에서 바깥 변수를 참조하려면 `vi.hoisted` 로 만든 홀더를 쓰고,
대상 모듈은 `await import(...)` 로 가져온다.

```ts
const holder = vi.hoisted(() => ({ prisma: null as unknown }));
vi.mock("../../lib/prisma.js", () => ({ getPrisma: () => holder.prisma }));
const { createPost } = await import("./psPost.service.js");
```

### 4. 새 엔드포인트의 인증 구분 누락

`createApp()` 에서 공개/인증 중 어디에 mount 할지 반드시 결정한다.
인증이 필요하면 라우터 내부에 `router.use("/경로", requireAuth)` 를 넣는다.

### 5. 프론트가 의존하는 응답 형태 변경

프론트 `src/api/*.ts` 의 타입과 계약이 묶여 있다. 특히:
- `GET /api/posts` 는 Spring Data `Page<T>` 형태 (`lib/page.ts` 의 `toPage`)
- `POST/PUT /api/posts` 는 **raw number** 를 반환한다 (객체로 감싸지 말 것)
- `GET /api/auth/me` 는 비로그인 시에도 200 + `{ authenticated: false }`

### 6. Prisma Client 미생성 상태에서 테스트 실행

`lib/prisma.ts` 는 `@prisma/client` 를 import 하고, 이 패키지는 `prisma generate` 로 만들어지는
`.prisma/client` 를 재export한다. 생성 전에는 `Cannot find module '.prisma/client/default'` 로
**`createApp()` 을 import 하는 테스트 파일 전체가 죽는다.**

`npm test` 는 `pretest` 훅이 알아서 생성하지만,
`npx vitest run <파일>` 로 바로 실행할 때는 한 번은 `npm run prisma:generate` 가 필요하다.

### 7. Express 5 와일드카드 문법

Express 5(path-to-regexp v8)에서는 `/api/*` 가 유효하지 않다.
필요하면 `/api/*splat` 또는 `{*splat}` 형태를 쓴다.
