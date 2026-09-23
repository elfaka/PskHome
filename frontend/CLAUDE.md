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
| motion (`motion/react`) | 청첩장 인트로·스크롤 애니메이션 (`/wedding` 에서만 import) |
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
│   ├── career/page.tsx                          # /career
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
├── jsonprettier/
│   ├── layout.tsx                               # metadata
│   ├── page.tsx                                 # /jsonprettier
│   └── [...slug]/page.tsx                       # 그 외 → /jsonprettier 로 리다이렉트
└── wedding/                                     # 모바일 청첩장 — SiteShell 없음, 사이트 테마와 분리
    ├── layout.tsx                               # metadata(noindex), 폰트, .wedding-root
    ├── page.tsx                                 # /wedding
    └── [...slug]/page.tsx                       # 그 외 → /wedding 으로 리다이렉트
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
│   ├── googleform/  (GoogleFormShell, FormsList, Login, analyze/*)
│   └── wedding/     (WeddingInvitation, introMachine, scene/* 첫 화면, sections/*, ui/*)
├── data/         # 화면이 공유하는 정적 데이터 (projects.ts, profile.ts, wedding.ts)
├── lib/          # 공용 유틸 (errorMessage, cn 등) — lib/wedding/ 은 청첩장 전용 순수 로직
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

### 예외: `/wedding` (모바일 청첩장)

청첩장은 사이트 톤과 무관한 별도 팔레트(세이지·아이보리)를 쓰고 **다크 테마를 따르지 않는다.**

- 토큰은 `globals.css` 6번 구획의 `wd-*` (`bg-wd-ivory`, `text-wd-ink`, `bg-wd-sage-deep` ...).
  값은 `.wedding-root` 안에서만 정의되므로 다른 화면에서 쓰면 효과가 없다.
- `wd-sage` 는 흰 글씨와 3.8:1 이라 **장식 전용**이다. 텍스트·버튼 배경은 `wd-sage-deep`.
- 콘텐츠는 `src/data/wedding.ts` 한 곳에서 바꾼다. 옵셔널 필드가 비면 해당 요소는 렌더되지 않는다.
  날짜·시각 형식이 틀리면 빌드(프리렌더)에서 에러로 멈춘다.
- 뷰포트 분기는 픽셀 폭이 아니라 **화면비** 기준이다 (폴더블 대응).

  | variant | 조건 | 대상 |
  |---|---|---|
  | `wd-cover` | 폭 < 560, 폭/높이 ≥ 0.6, 높이 > 500 | Galaxy Z Fold8 커버(10:16), iPhone Duo 커버(14.5:10) |
  | `wd-unfolded` | 폭 ≥ 560, 폭/높이 ≥ 0.6, 높이 > 500 | 폴더블 메인(4:3, 14.2:10), 태블릿, 데스크톱 |

  섹션 내부 2단은 뷰포트가 아니라 컨테이너 쿼리(`@container` + `@[34rem]:`)로 나눈다.
  2단 거터가 화면 중앙에 오므로 폴더블 메인 화면의 접힘선에 글자가 걸리지 않는다.
- `@container` 요소는 fixed 자식의 기준이 된다. 토스트·인트로 같은 fixed 요소는 컨테이너 밖에 둔다.
- motion(13.x) 에서 확인한 두 가지:
  - `style` 로 넘긴 zIndex 는 재렌더 때 갱신되지 않는다. 단계에 따라 바뀌는 값은 `className` 으로 준다.
  - `initial={false}` 인 요소의 `animate` 가 `undefined` 에서 값으로 바뀌면 첫 값이 적용되지 않는다.
    측정값에 의존하는 요소는 측정이 끝난 뒤에 마운트한다.
- 첫 화면 = 열린 봉투 한 장면(`components/wedding/scene/`, Studio Gwyn "Envelope 06" 구성).
  - 단계: `sealed → opening → rising → blooming → done`. 봉투는 움직이지 않고, 봉인 문구 자리에 카드가 올라오고 부케가 핀다.
  - 장면은 2:3 고정 비율(`.wd-stage`, `@container`)이고 좌표는 100 × 150 단위다(`scene/geometry.ts`). HTML 요소와 SVG 꽃이 같은 좌표를 쓴다.
    층(뒤→앞): 봉투 뒤판 · 덮개 · 사진 · `BouquetBack` · 카드 · `BouquetMid` · 앞주머니 · `BouquetFront` · LP.
  - 장면 안 글자 크기는 `cqw`(장면 폭) 기준이라 그림 전체가 같은 비율로 줄고 늘어난다. 장면은 300px 밑으로 줄이지 않는다.
    높이가 낮은 가로 폰에서 장면이 한 화면을 넘으면 봉인 중에도 스크롤을 잠그지 않는다.
  - 생화는 `scene/flora.tsx` 에 있다.
    - 장미·칼라는 실제 꽃 사진이다(`public/wedding/flowers/*.webp`, 위키미디어 공용 CC BY-SA 3.0 / CC BY 3.0 원본의 배경 제거·크기 조정본).
      라이선스상 저작자 표시가 필요하므로 `PHOTO_CREDITS` 를 클로징에 표시한다. 사진을 바꾸거나 추가하면 여기도 함께 고친다.
    - 수국·아스틸베·아마란서스·안개꽃·잎은 SVG 원형이고, 색은 `PALETTE` 에서 바꾼다.
    - 칼라 꽃 머리가 장면 윗변 위로 솟기 때문에 `.wd-stage` 가 그만큼 위 여백을 둔다.
    작은 꽃이 모인 꽃은 시드 난수라 결정적이다(서버/클라이언트 동일).
  - 봉투는 SVG 필터(노이즈 변위 → 데클 가장자리, 확산 조명 → 펠트 결)로 수제 종이를 흉내 낸다.
  - JS 가 없으면 `.wd-sealed-only` 를 숨기고 `.wd-reveal` 의 초기 상태를 풀어 열린 장면을 보여준다(`app/wedding/layout.tsx`).
- 종이 질감은 `.wd-paper-texture`(흰 종이), `.wd-colored-paper`(색지)다. 노이즈는 SVG feTurbulence data URI 라서 이미지 파일이 없다.
- 배경음악: `lib/wedding/musicBox.ts` 가 Web Audio 로 오르골을 합성한다 (음원 파일 없음. 악보는 `musicLoop.ts`).
  - 봉투를 터치할 때 같은 이벤트 안에서 `useMusicBox().start()` 를 불러 음악이 시작된다(`EnvelopeScene` 의 `handleOpen`).
    브라우저 자동재생 정책상 AudioContext 생성·resume 은 사용자 터치 이벤트 안에서 동기적으로 시작돼야 한다. 진입만으로는 재생하지 않는다.
  - LP 는 멈춤/재생 토글이다. Web Audio 를 못 쓰면 LP 만 돈다.
  - 실제 음원으로 바꿀 때는 `useMusicBox` 의 재생 엔진만 교체하면 된다.
- PowerShell 로 한글이 든 소스를 고칠 때는 `[IO.File]::ReadAllText(path, [Text.Encoding]::UTF8)` 처럼 인코딩을 명시한다.
  `Get-Content -Raw` 는 CP949 로 읽어 주석이 깨진다.

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
