# PskHome Project Overview

개인 포트폴리오 + 도구 모음 사이트. 백엔드(Express) + 프론트엔드(Next.js) 풀스택 프로젝트.

## 기능 목록

| 기능 | URL | 설명 |
|------|-----|------|
| 홈/포트폴리오 | `/` | About, Projects 소개 페이지 |
| PS 문제풀이 | `/pspost` | 알고리즘 문제풀이 작성/조회/수정/삭제 |
| JSON Prettier | `/jsonprettier` | JSON 포맷/압축/키 정렬/ASCII 이스케이프 |
| Google 설문 분석 | `/googleform` | Google Forms 연동 설문 분석 |

## 기술 스택

### 백엔드 (`backend/`)
| 기술 | 버전 | 용도 |
|------|------|------|
| Express | 5.x | HTTP 프레임워크 |
| TypeScript | 5.9 | 언어 (NodeNext ESM) |
| Node.js | 22 | 런타임 |
| Prisma + `@prisma/adapter-mariadb` | 7.x | MySQL ORM |
| express-session | - | 세션 (프로세스 메모리) |
| Passport (`passport-google-oauth20`) | - | Google OAuth2 로그인 |
| googleapis | - | Google Drive v3 / Forms v1 |
| zod | 4.x | 환경변수 검증 |
| Vitest + Supertest | - | 테스트 |

### 프론트엔드 (`frontend/`)
| 기술 | 버전 | 용도 |
|------|------|------|
| Next.js (App Router) | 16.x | 프레임워크/라우팅/빌드 |
| React | 19.x | UI |
| TypeScript | 5.9 | 언어 |
| Tailwind CSS | 4.x | 스타일링 |
| axios | 1.x | HTTP 클라이언트 |
| react-markdown | 10.x | PS 게시글 본문 렌더링 |
| Vitest + MSW | - | 테스트 |

### 인프라 (`server/`)
- **MySQL** — PS Post 데이터 저장 (`ps_post` 테이블)
- **Docker Compose** — 3개 파일로 DB/백엔드/프론트엔드 분리 운영
  (백엔드/프론트엔드는 각 폴더의 `dockerfile` 로 서버에서 직접 빌드)
- **GitHub Actions** — CI/CD (`be-cd.yaml`, `fe-cd.yaml`) — lint/test/build 게이트 후 배포

## 로컬 개발 빠른 시작

```bash
# 1. 인프라 (MySQL:3306)
cd server && docker compose -f docker-compose-db.yaml up -d

# 2. 백엔드 (localhost:8080)  — .env 준비 필요 (.env.example 참고)
cd backend && npm install && npm run dev

# 3. 프론트엔드 (localhost:5173, /api → 8080 프록시)
cd frontend && npm install && npm run dev
```

## 백엔드 주요 파일 위치

```
backend/src/
├── index.ts                         # 진입점 (listen, graceful shutdown)
├── app.ts                           # createApp() — 공개/인증 경계가 여기서 결정됨
├── config/
│   ├── env.ts                       # zod 환경변수 스키마
│   ├── session.ts                   # express-session (MemoryStore)
│   └── passport.ts                  # Google OAuth2 전략, scope
├── middleware/
│   ├── requireAuth.ts               # 인증 게이트 (401 JSON)
│   └── errorHandler.ts              # 전역 에러 → JSON
├── lib/
│   ├── httpError.ts                 # 상태코드를 가진 예외
│   ├── page.ts                      # Spring Data Page 형태 헬퍼
│   └── prisma.ts                    # Prisma client (지연 초기화)
└── modules/
    ├── ping/ping.router.ts
    ├── jsonprettier/                # router / service / types
    ├── pspost/                      # router / service / types
    └── survey/                      # auth.router, forms.router,
                                     # forms.service, analyze.service, google/

backend/prisma/schema.prisma         # 기존 ps_post 테이블 매핑 (마이그레이션 생성 안 함)
backend/prisma.config.ts             # Prisma 7 접속 설정 (CLI 용)
backend/.env                         # 환경변수 (git 제외)
backend/.env.example                 # 템플릿
```

## 프론트엔드 주요 파일 위치

```
frontend/src/
├── app/                             # 파일 라우팅
│   ├── layout.tsx                   #   루트 레이아웃
│   ├── (home)/                      #   /, /about, /project, /pspost/**
│   ├── googleform/                  #   /googleform/**
│   └── jsonprettier/                #   /jsonprettier
├── api/
│   ├── client.ts                    # axios 인스턴스 (withCredentials)
│   ├── pspost.ts                    # PS Post API 함수
│   └── jsonPrettierApi.ts           # JSON Prettier API 함수
├── components/
│   ├── layout/Homeheader/
│   ├── pspost/PostForm.tsx          # 작성/수정 공용 폼
│   └── googleform/                  # GoogleFormShell, FormsList, Login, analyze/*
├── lib/errorMessage.ts              # 공용 에러 메시지 추출
└── test/
    ├── setup.ts                     # Vitest 전역 설정
    └── mocks/                       # MSW 서버 + 핸들러
```

## 환경 변수

### 백엔드 (`backend/.env`)

| 변수 | 기본값 | 용도 |
|------|--------|------|
| `NODE_ENV` | `development` | `production` 이면 세션 쿠키에 secure 플래그 |
| `PORT` | `8080` | |
| `DATABASE_URL` | (없음) | `mysql://user:pass@host:3306/page` |
| `SESSION_SECRET` | 개발용 기본값 | 운영에서는 반드시 지정 |
| `SESSION_COOKIE_NAME` | `psk.sid` | |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | (없음) | 없으면 로그인 경로만 503 |
| `GOOGLE_CALLBACK_URL` | `http://localhost:8080/api/login/oauth2/code/google` | Console 등록값과 일치 필요 |
| `APP_LOGIN_SUCCESS_REDIRECT` | `http://localhost:5173/googleform/forms` | |

### 프론트엔드

| 변수 | 기본값 | 용도 |
|------|--------|------|
| `API_PROXY_TARGET` | 개발 시 `http://localhost:8080` | dev 서버의 `/api` 프록시 대상 |

### 배포 (GitHub Secrets)

`SSH_HOST_NAME`, `SSH_USER_NAME`, `SSH_PRIVATE_KEY`, `SSH_PORT`,
`MYSQL_ROOT_PASSWORD`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

## 테스트 실행

```bash
# 백엔드 (외부 의존 없음 — MySQL/Google 불필요)
cd backend && npm test

# 프론트엔드 (MSW 목 서버, 실제 서버 불필요)
cd frontend && npm run test
```

## 보안 엔드포인트 정책

- **공개 (인증 불필요):** `/api/ping`, `/api/auth/me`, `/api/auth/logout`,
  `/api/json/**`, `/api/posts/**`, `/api/oauth2/**`, `/api/login/oauth2/**`
- **인증 필요:** `/api/forms/**` (Google OAuth2 세션)
- **미인증 응답:** 302 리다이렉트가 아니라 401 JSON

## 배포

```bash
# 로컬 검증
cd backend && npm run lint && npm test && npm run build
cd frontend && npm run lint && npm run test && npm run build

# 배포 (main 브랜치 push 시 GitHub Actions 자동 실행)
# be-cd.yaml → lint/test/build 게이트 → 소스 전송 → 서버에서 이미지 빌드 + 기동
# fe-cd.yaml → 동일
```

## Claude Code 상세 가이드

- 백엔드 개발: [`backend/CLAUDE.md`](../backend/CLAUDE.md)
- 프론트엔드 개발: [`frontend/CLAUDE.md`](../frontend/CLAUDE.md)
