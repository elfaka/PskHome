import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Login
 *
 * [역할]
 * - Google OAuth2 로그인을 시작하는 프론트 진입 페이지
 *
 * [동작 흐름]
 * 1) authenticated === true
 *    → 이미 로그인된 상태이므로 설문 목록으로 즉시 이동
 *
 * 2) 로그인 버튼 클릭
 *    → /api/oauth2/authorization/google 로 이동
 *    → Spring Security OAuth2 로그인 플로우 시작
 *    → 로그인 성공 후 백엔드에서 설정된 redirect URL로 이동
 *
 * [주의]
 * - OAuth2 로그인은 브라우저 리다이렉트 기반이므로
 *   axios/api 호출이 아닌 window.location.href 사용
 */
export default function Login({ authenticated }: { authenticated: boolean }) {
  const nav = useNavigate();

  /**
   * 이미 로그인된 상태라면
   * 이 페이지에 머무르지 않고 바로 설문 목록으로 이동
   *
   * UX 포인트:
   * - 로그인 페이지를 잠깐 보여주지 않아 깔끔함
   */
  useEffect(() => {
    if (authenticated) nav("/googleform/forms");
  }, [authenticated, nav]);

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-extrabold text-zinc-900">
          Google 로그인
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Google Forms 설문과 응답을 불러와 분석합니다.
        </p>

        {/* OAuth2 로그인 시작 버튼 */}
        <button
          onClick={() => {
            // OAuth2는 리다이렉트 기반 플로우이므로
            // SPA 라우터(nav)가 아닌 location.href 사용
            window.location.href = "/api/oauth2/authorization/google";
          }}
          className="mt-5 w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-extrabold text-white hover:bg-zinc-800 active:scale-[0.99]"
        >
          Sign in with Google
        </button>

        <p className="mt-4 text-xs text-zinc-500">
          로그인 완료 후 설문 목록으로 이동합니다.
        </p>
      </div>
    </div>
  );
}
/*
“로그인 페이지는 OAuth2 플로우의 시작만 담당하고,
토큰 처리와 리다이렉트는 전부 백엔드에 위임했습니다.
이미 로그인된 경우에는 UX를 위해 즉시 설문 목록으로 이동하도록 처리했습니다.”
*/