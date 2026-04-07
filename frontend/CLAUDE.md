# Frontend CLAUDE.md

React + Vite 프론트엔드 개발 가이드. 루트 [`CLAUDE.md`](../CLAUDE.md)의 명령어와 함께 참고할 것.

## 라우트 구조

```
App.tsx
├── /*           → pages/home/home.tsx
│   ├── /        → pages/home/main/main.tsx
│   ├── /about   → pages/home/about/about.tsx
│   ├── /project → pages/home/project/project.tsx
│   └── /pspost  → pages/home/pspost/ (List, Detail, Form)
├── /googleform/* → pages/googleform/googleform.tsx
│   ├── /        → Login.tsx
│   ├── /forms   → FormsList.tsx
│   └── /analyze → AnalyzePage.tsx
└── /jsonprettier/* → pages/jsonprettier/ (JsonPrettierPage.tsx)
```

## API 클라이언트 패턴

**HTTP 클라이언트:** `src/api/client.ts` — axios instance, `baseURL: ""`, `withCredentials: true`

새 API 함수 추가 시:
1. `src/api/` 에 기능별 파일 생성 (예: `src/api/newfeature.ts`)
2. `client`를 import해 axios 인스턴스 사용
3. 타입을 파일 내에 정의

```typescript
import { api } from "./client";

export type MyData = { id: number; name: string };

export async function fetchData(id: number) {
  const { data } = await api.get<MyData>(`/api/myfeature/${id}`);
  return data;
}
```

**기존 API 파일:**
- `src/api/pspost.ts` — PS 게시글 CRUD (`listPosts`, `getPost`, `createPost`, `updatePost`, `deletePost`)
- `src/api/jsonPrettierApi.ts` — JSON 포맷 (`formatJson`)

## 컴포넌트 조직

- `src/components/` — 여러 페이지에서 재사용되는 공통 컴포넌트
- `src/pages/` — 라우트 단위 페이지 컴포넌트 (라우트별 폴더로 분리)
- `src/types/` — 공통 TypeScript 타입 정의

## 스타일링

MUI 6 + Tailwind CSS 4 혼용:
- **MUI** — 복잡한 UI 컴포넌트 (`Button`, `Table`, `Dialog` 등)
- **Tailwind** — 레이아웃, 간단한 유틸리티 클래스 (`flex`, `gap-4`, `text-sm` 등)
- 두 시스템 혼용 가능: `<Button className="mt-4">` (MUI 컴포넌트 + Tailwind 클래스)

## 환경 설정

**개발:** Vite dev server가 `/api` 요청을 `http://localhost:8080`으로 프록시
- 설정 위치: `vite.config.ts`의 `server.proxy`

**프로덕션:** `frontend/dist/`를 Nginx가 서빙 (`server/docker-compose-fe.yaml`)
- Nginx가 `/api/*` 요청을 백엔드로 프록시

## 테스트

```bash
# 전체 테스트 실행 (서버 불필요, MSW가 API 요청 인터셉트)
cd frontend && npm run test

# Watch 모드
cd frontend && npm run test:watch

# UI로 확인
cd frontend && npm run test:ui
```

**테스트 구조:**
- `src/test/setup.ts` — 전역 설정, MSW 서버 lifecycle
- `src/test/mocks/server.ts` — MSW Node.js 서버
- `src/test/mocks/handlers.ts` — API 엔드포인트 목 핸들러
- `src/api/*.test.ts` — API 함수 단위 테스트

**새 테스트 작성 패턴:**
```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "./myModule";

describe("myFunction", () => {
  it("does something", async () => {
    const result = await myFunction();
    expect(result).toHaveProperty("id");
  });
});
```

새 API 엔드포인트 테스트 시 `src/test/mocks/handlers.ts`에 handler 추가 필요.

## 빌드 출력

```bash
cd frontend && npm run build
# 출력: frontend/dist/
# Docker: server/docker-compose-fe.yaml이 dist/ 를 Nginx로 서빙 (:5173)
```
