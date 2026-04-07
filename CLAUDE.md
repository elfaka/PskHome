# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 각 서브 모듈의 상세 가이드: [`backend/CLAUDE.md`](backend/CLAUDE.md), [`frontend/CLAUDE.md`](frontend/CLAUDE.md)
> 프로젝트 전체 개요: [`docs/skill.md`](docs/skill.md)

## Commands

### Backend (Spring Boot + Gradle, Java 21)
```bash
# Run locally (requires local MySQL + Redis)
cd backend && ./gradlew bootRun --args='--spring.profiles.active=local'

# Build JAR (output: backend/build/libs/*.jar)
cd backend && ./gradlew build

# Run tests (H2 in-memory, MySQL/Redis not required)
cd backend && ./gradlew test

# Run a single test class
cd backend && ./gradlew test --tests "kr.elfaka.lostark.SomeTest"
```

### Frontend (React + Vite)
```bash
# Dev server (opens browser, proxies /api → localhost:8080)
cd frontend && npm run dev

# Production build (output: frontend/dist/)
cd frontend && npm run build

# Lint
cd frontend && npm run lint

# Run tests (Vitest + MSW, server not required)
cd frontend && npm run test

# Run tests in watch mode
cd frontend && npm run test:watch
```

### Infrastructure (Docker Compose)
```bash
# Start DB (MySQL:3306) + cache (Redis:6379)
cd server && docker compose -f docker-compose-db.yaml up -d

# Start backend (serves JAR from backend/build/libs/)
cd server && docker compose -f docker-compose-be.yaml up -d

# Start frontend (serves frontend/dist/ via Nginx on :5173)
cd server && docker compose -f docker-compose-fe.yaml up -d
```
All three compose files share a Docker network named `traefik`.

## Architecture

### Backend (`backend/src/main/java/kr/elfaka/lostark/`)

Spring Boot 3 app, base package `kr.elfaka.lostark`. Modules:

- **`character/`** — Proxies calls to the external LostArk Open API (`https://developer-lostark.game.onstove.com`) via Spring Cloud OpenFeign (`LostArkFeignClient`). The API key is stored Jasypt-encrypted in `application-local.yaml` under `cloud.openfeign.client.config.open-api.default-request-headers.Authorization`.
- **`jsonprettier/`** — Stateless JSON formatting service exposed at `/api/json/**` (public, no auth required).
- **`pspost/`** — Simple CRUD for posts, persisted in MySQL via Spring Data JPA. Endpoint `/api/posts/**` is public.
- **`survey/`** — Google Forms/Sheets integration. Uses Spring Security OAuth2 (session-based) for Google login. OAuth2 endpoints are under `/api/oauth2/**` and `/api/login/oauth2/**`. Login success redirects to the URL in `app.login-success-redirect`.
- **`config/SecurityConfig`** — CSRF disabled. `/api/**` requires authentication except: `/api/ping`, `/api/auth/me`, `/api/json/**`, `/api/posts/**`, and OAuth2 flow paths.

**Profiles:** `local` (uses `application-local.yaml` — plain MySQL credentials, `ddl-auto: update`, `show-sql: true`) and `prod` (uses `application-prod.yaml`, env vars injected via Docker). Jasypt encrypts secrets; the encryptor password is supplied via `JASYPT_ENCRYPTOR_PASSWORD` env var.

### Frontend (`frontend/src/`)

SPA with three top-level routes:
- `/*` → `pages/home/`
- `/googleform/*` → `pages/googleform/`
- `/jsonprettier/*` → `pages/jsonprettier/`

Vite dev server proxies `/api` to `http://localhost:8080`. Production build is served by Nginx (see `docker-compose-fe.yaml`).

API calls are organized per feature in `src/api/` (`pspost.ts`, `jsonPrettierApi.ts`, `client.ts`).
