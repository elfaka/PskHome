# PskHome Project Overview

개인 포트폴리오 + 도구 모음 사이트. 백엔드(Spring Boot) + 프론트엔드(React) 풀스택 프로젝트.

## 기능 목록

| 기능 | URL | 설명 |
|------|-----|------|
| 홈/포트폴리오 | `/` | About, Projects 소개 페이지 |
| PS 문제풀이 | `/pspost` | 알고리즘 문제풀이 작성/조회/수정/삭제 |
| JSON Prettier | `/jsonprettier` | JSON 포맷/압축/키 정렬/ASCII 이스케이프 |
| Google 설문 분석 | `/googleform` | Google Forms/Sheets 연동 설문 분석 |

## 기술 스택

### 백엔드 (`backend/`)
| 기술 | 버전 | 용도 |
|------|------|------|
| Spring Boot | 3.4.1 | 메인 프레임워크 |
| Java | 21 | 언어 |
| Gradle | 8.x | 빌드 도구 |
| Spring Security | - | OAuth2 Google 로그인 |
| Spring Data JPA | - | MySQL ORM |
| Spring Cloud OpenFeign | 2024.0.0 | LostArk API 호출 |
| Jasypt | 3.0.5 | 시크릿 암호화 |
| JUnit 5 + Mockito | - | 테스트 |
| H2 | - | 테스트용 인메모리 DB |

### 프론트엔드 (`frontend/`)
| 기술 | 버전 | 용도 |
|------|------|------|
| React | 18.3.1 | UI 프레임워크 |
| TypeScript | 5.9.3 | 언어 |
| Vite | 6.x | 번들러/Dev 서버 |
| MUI | 6.1.10 | UI 컴포넌트 라이브러리 |
| Tailwind CSS | 4.1.x | 유틸리티 스타일링 |
| Axios | 1.7.x | HTTP 클라이언트 |
| Vitest + MSW | 2.1.x + 2.6.x | 테스트 |

### 인프라 (`server/`)
- **MySQL** — PS Post 데이터 저장
- **Redis** — 세션 저장 (survey 모듈)
- **Docker Compose** — 3개 파일로 DB/백엔드/프론트엔드 분리 운영
- **GitHub Actions** — CI/CD (`be-cd.yaml`, `fe-cd.yaml`)

## 로컬 개발 빠른 시작

```bash
# 1. 인프라 (MySQL:3306, Redis:6379)
cd server && docker compose -f docker-compose-db.yaml up -d

# 2. 백엔드 (localhost:8080)
cd backend && ./gradlew bootRun --args='--spring.profiles.active=local'

# 3. 프론트엔드 (localhost:5173, /api → 8080 프록시)
cd frontend && npm install && npm run dev
```

## 백엔드 주요 파일 위치

```
backend/src/main/java/kr/elfaka/lostark/
├── LostArkApplication.java          # 진입점
├── config/SecurityConfig.java       # 보안 설정, permitAll 경로 목록
├── character/
│   ├── controller/LostArkController.java
│   ├── service/LostArkService.java
│   └── feign/LostArkFeignClient.java
├── jsonprettier/
│   ├── controller/JsonFormatController.java
│   └── service/JsonFormatService.java
├── pspost/
│   ├── controller/PsPostController.java
│   ├── service/PsPostService.java
│   ├── entity/PsPost.java
│   └── repository/PsPostRepository.java
└── survey/
    ├── controller/AnalyzeController.java
    └── service/ (FormsService, AnalyzeService 등)

backend/src/main/resources/
├── application.yaml           # 공통 설정
├── application-local.yaml     # 로컬 개발 (MySQL 직연결, show-sql)
└── application-prod.yaml      # 프로덕션 (env var)

backend/src/test/resources/
└── application-test.yaml      # 테스트 (H2, Redis 비활성화)
```

## 프론트엔드 주요 파일 위치

```
frontend/src/
├── App.tsx                    # 라우팅 루트
├── api/
│   ├── client.ts              # axios 인스턴스
│   ├── pspost.ts              # PS Post API 함수
│   └── jsonPrettierApi.ts     # JSON Prettier API 함수
├── pages/
│   ├── home/                  # /, /about, /project, /pspost
│   ├── googleform/            # /googleform
│   └── jsonprettier/          # /jsonprettier
├── components/
│   └── layout/Homeheader/
└── test/
    ├── setup.ts               # Vitest 전역 설정
    └── mocks/
        ├── server.ts          # MSW 서버
        └── handlers.ts        # API 목 핸들러
```

## 환경 변수

| 변수 | 용도 | 파일 |
|------|------|------|
| `JASYPT_ENCRYPTOR_PASSWORD` | LostArk API Key 복호화 | `backend/.env` |
| `DB_URL` | MySQL URL (prod) | Docker env |
| `DB_USERNAME` / `DB_PASSWORD` | MySQL 인증 (prod) | Docker env |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth2 (local) | `application-local.yaml` |

## 테스트 실행

```bash
# 백엔드 (H2 인메모리, MySQL/Redis 불필요)
cd backend && ./gradlew test

# 프론트엔드 (MSW 목 서버, 실제 서버 불필요)
cd frontend && npm run test
```

## 보안 엔드포인트 정책

- **공개 (인증 불필요):** `/api/ping`, `/api/json/**`, `/api/posts/**`, `/api/auth/me`
- **인증 필요:** 나머지 `/api/**` (Google OAuth2 세션)
- **CSRF:** 비활성화 (REST API)

## 배포

```bash
# 백엔드 JAR 빌드
cd backend && ./gradlew build
# 출력: backend/build/libs/backend-0.0.1-SNAPSHOT.jar

# 프론트엔드 빌드
cd frontend && npm run build
# 출력: frontend/dist/

# 배포 (GitHub Actions 자동 실행)
# be-cd.yaml → 백엔드 Docker 이미지 빌드 + 배포
# fe-cd.yaml → 프론트엔드 Docker 이미지 빌드 + 배포
```

## Claude Code 상세 가이드

- 백엔드 개발: [`backend/CLAUDE.md`](../backend/CLAUDE.md)
- 프론트엔드 개발: [`frontend/CLAUDE.md`](../frontend/CLAUDE.md)
