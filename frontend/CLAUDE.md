# Frontend CLAUDE.md

Next.js (App Router) + TypeScript 프론트엔드 개발 가이드.
루트 [`CLAUDE.md`](../CLAUDE.md)의 명령어와 함께 참고할 것.

## 스택

| 기술 | 용도 |
|------|------|
| Next.js 16 (App Router) | 프레임워크 / 라우팅 / 빌드 |
| React 19 | UI |
| TypeScript | 언어 |
| Tailwind CSS 4 (`@tailwindcss/postcss`) | 스타일링 |
| `@tailwindcss/typography` | 마크다운(prose) 본문 스타일 |
| axios | HTTP 클라이언트 |
| react-markdown | PS 게시글 본문 렌더링 |
| Vitest + MSW + Testing Library | 테스트 |

> 이 프로젝트는 **클라이언트 중심**이다. 데이터는 서버 컴포넌트가 아니라
> 브라우저에서 axios 로 `/api/**` 를 호출해 가져온다.
> 백엔드 세션 쿠키(`withCredentials`)에 의존하기 때문이다.

## 라우트 구조

```
src/app/
├── layout.tsx                                   # 루트 레이아웃 (html/body, globals.css)
├── (home)/                                      # 라우트 그룹 — URL 에는 나타나지 않음
│   ├── layout.tsx                               #   SiteShell (헤더 + 본문 + 푸터)
│   ├── page.tsx                                 # /
│   ├── about/page.tsx                           # /about
│   ├── project/page.tsx                         # /project
│   └── pspost/
│       ├── page.tsx                             # /pspost        (목록)
│       ├── new/page.tsx                         # /pspost/new    (작성)
│       └── [id]/
│           ├── page.tsx                         # /pspost/:id      (상세)
│           └── edit/page.tsx                    # /pspost/:id/edit (수정)
├── googleform/
│   ├── layout.tsx                               # metadata + GoogleFormShell
│   ├── page.tsx                                 # /googleform (로그인 여부로 분기)
│   ├── login/page.tsx                           # /googleform/login
│   ├── forms/page.tsx                           # /googleform/forms
│   ├── forms/[formId]/analyze/page.tsx          # /googleform/forms/:formId/analyze
│   └── [...slug]/page.tsx                       # 그 외 → /googleform 으로 리다이렉트
└── jsonprettier/
    ├── layout.tsx                               # metadata
    ├── page.tsx                                 # /jsonprettier
    └── [...slug]/page.tsx                       # 그 외 → /jsonprettier 로 리다이렉트
```

**라우트 페이지는 얇게 유지한다.** 실제 화면 구현은 `src/components/` 에 두고
페이지는 조립만 한다. (`/pspost/new` 와 `/pspost/[id]/edit` 가 같은 `PostForm` 을 공유하는 이유)

## 디렉터리

```
src/
├── app/          # 라우트 (파일 라우팅)
├── api/          # 백엔드 호출 함수 + 응답 타입
├── components/   # 화면 구현체
│   ├── ui/       # 디자인 프리미티브 (Button, Card, Field, Badge ...)
│   ├── theme/    # 라이트/다크 테마 (ThemeScript, themeStore, ThemeToggle)
│   ├── layout/   # SiteShell, SiteHeader, SiteFooter, ProjectFlyout, nav.ts
│   ├── pspost/PostForm.tsx
│   └── googleform/  (GoogleFormShell, FormsList, Login, analyze/*)
├── data/         # 화면이 공유하는 정적 데이터 (projects.ts)
├── lib/          # 공용 유틸 (errorMessage, cn 등)
└── test/         # Vitest 셋업 + MSW 목
```

경로 별칭은 `@/*` → `src/*` 이다. (`import { api } from "@/api/client"`)

## 디자인 시스템

**화면에서 Tailwind 원색(`zinc-200`, `gray-50`)이나 hex 를 직접 쓰지 않는다.**
`src/app/globals.css` 가 시맨틱 토큰을 정의하고, 화면은 그 유틸리티만 쓴다.

| 종류 | 유틸리티 |
|------|----------|
| 표면 | `bg-bg`, `bg-surface`, `bg-surface-2`, `bg-surface-hover` |
| 경계 | `border-line`, `border-line-strong`, 구분선은 `bg-line` |
| 텍스트 | `text-fg`, `text-fg-muted`, `text-fg-subtle` |
| 강조 | `bg-accent`, `text-accent-fg`, `bg-accent-soft`, `text-accent-soft-fg` |
| 상태 | `success` / `warning` / `danger` / `info` (+ `-soft`, `-soft-fg`) |
| 라운드 | `rounded-control`(버튼·인풋), `rounded-card`, `rounded-panel` |
| 그림자 | `shadow-card`, `shadow-raised`, `shadow-overlay` |

모든 조합은 라이트/다크 양쪽에서 WCAG AA(4.5:1)를 넘도록 값을 골라 두었다.
토큰 색을 바꿀 때는 명암비를 함께 확인할 것.

**다크모드**는 `[data-theme]` 속성 기반이다 (`@custom-variant dark`).
`ThemeScript` 가 첫 페인트 전에 동기적으로 속성을 심어 플래시를 막고,
상태는 `themeStore` + `useSyncExternalStore` 로 구독한다.
`prefers-color-scheme` 만 쓰면 사용자 토글을 표현할 수 없어서 이 구조다.

**프리미티브**(`components/ui/`)를 먼저 찾아보고 없을 때만 새로 만든다.
버튼·카드는 `next/link` 에도 붙일 수 있도록 클래스 함수도 함께 노출한다.

```tsx
import Button, { buttonClass } from "@/components/ui/Button";

<Button variant="primary" onClick={save}>저장</Button>
<Link href="/pspost/new" className={buttonClass({ variant: "primary" })}>새 글</Link>
```

마크다운 본문에는 `prose prose-app` 을 쓴다.
`prose-app` 이 typography 플러그인 색을 테마 토큰으로 덮는다.

## API 클라이언트 패턴

**HTTP 클라이언트:** `src/api/client.ts` — axios instance, `baseURL: ""`, `withCredentials: true`

새 API 함수 추가 시:
1. `src/api/` 에 기능별 파일 생성 (예: `src/api/newfeature.ts`)
2. `client` 를 import 해 axios 인스턴스 사용
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

**에러 메시지**는 `@/lib/errorMessage` 의 `errorMessage(e, fallback)` 로 뽑는다.
백엔드 실패 응답 형태(`{ error: { code, message } }`)를 알고 있으므로 화면마다 파싱하지 않는다.

## 인증 (googleform 영역)

- `GoogleFormShell` 이 `/api/auth/me` 를 **한 번만** 호출해 컨텍스트로 내려준다.
  각 페이지에서 중복 확인하지 않는다.
- 인증이 필요한 페이지는 `RequireGoogleFormAuth` 로 감싼다.
  미인증이면 `/googleform/login` 으로 `router.replace` 한다.
- 로그인 시작은 `window.location.href = "/api/oauth2/authorization/google"` 이다.
  **`router.push` 로 바꾸면 안 된다** — Next 페이지가 아니라 백엔드 엔드포인트로의
  브라우저 리다이렉트이기 때문이다.

## 환경 설정

**개발:** `next dev -p 5173` — `next.config.ts` 의 `rewrites` 가 `/api/*` 를
`http://localhost:8080` 으로 프록시한다. (`API_PROXY_TARGET` 으로 변경 가능)

> 포트가 5173 인 이유: 백엔드의 `APP_LOGIN_SUCCESS_REDIRECT` 기본값이
> `http://localhost:5173/googleform/forms` 라서 OAuth 로그인 후 돌아올 주소와 맞춰야 한다.

**프로덕션:** `output: "standalone"` 빌드를 Node 컨테이너가 실행한다
(`server/docker-compose-fe.yaml`, 외부 포트 5173 → 컨테이너 3000).
`/api` 는 Next 가 아니라 리버스 프록시(traefik)가 백엔드로 보낸다.

## 테스트

```bash
# 전체 (서버 불필요 — MSW 가 API 요청 인터셉트)
cd frontend && npm run test

# 특정 파일만
cd frontend && npx vitest run src/api/pspost.test.ts

# watch / UI
cd frontend && npm run test:watch
cd frontend && npm run test:ui
```

**테스트 구조:**
- `src/test/setup.ts` — 전역 설정, MSW 서버 lifecycle
- `src/test/mocks/server.ts` — MSW Node.js 서버
- `src/test/mocks/handlers.ts` — API 엔드포인트 목 핸들러
- `src/api/*.test.ts` — API 함수 단위 테스트

## 공통 실수 패턴

### 1. `"use client"` 누락

훅(`useState`/`useEffect`/`useRouter`)이나 이벤트 핸들러를 쓰는 컴포넌트는
파일 최상단에 `"use client";` 가 있어야 한다. 없으면 빌드 시 서버 컴포넌트로 취급돼 실패한다.

### 2. 클라이언트 컴포넌트에서 `metadata` export

`export const metadata` 는 서버 컴포넌트에서만 가능하다.
페이지 제목은 같은 폴더의 `layout.tsx`(서버 컴포넌트)에서 선언한다.
`document.title` 을 직접 세팅하지 말 것.

### 3. 새 API 엔드포인트에 MSW 핸들러 누락

새 API 함수 추가 시 `src/test/mocks/handlers.ts` 에 handler 를 함께 추가한다.
누락 시 실제 네트워크 요청을 시도한다.

```typescript
http.get("/api/newfeature/:id", ({ params }) => {
  return HttpResponse.json({ id: params.id, name: "mock" });
}),
```

### 4. 내부 링크에 `<a>` 사용

Next 페이지로 가는 링크는 `next/link` 를 쓴다.
`@next/next/no-html-link-for-pages` 규칙이 lint 에러로 잡는다.
(백엔드 엔드포인트나 존재하지 않는 페이지로 가는 링크는 `<a>` 가 맞다)

### 5. `catch (e: any)`

`@typescript-eslint/no-explicit-any` 에러다. `catch (e)` + `errorMessage(e, ...)` 를 쓴다.

### 6. ESLint 버전

`eslint-config-next` 가 의존하는 `eslint-plugin-react` 가 아직 ESLint 10 과 호환되지 않는다.
**ESLint 는 9.x 로 고정**되어 있다. 올리면 `npm run lint` 가 내부 오류로 죽는다.

## 빌드 출력

```bash
cd frontend && npm run build
# 출력: .next/standalone (+ .next/static, public)
# Docker: frontend/dockerfile 이 위 세 가지를 담아 `node server.js` 로 실행
```

## 알려진 경고 (lint)

`react-hooks/set-state-in-effect` 경고가 6곳 있다.
"마운트 시 fetch → setState" 패턴을 쓰는 기존 화면들이며,
데이터 로딩 구조를 손볼 때 정리한다. (`eslint.config.mjs` 에서 warn 으로 낮춰 둠)
