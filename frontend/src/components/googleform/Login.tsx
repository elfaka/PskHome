"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import Button from "@/components/ui/Button";
import { cardClass } from "@/components/ui/Card";

import { useGoogleFormAuth } from "./GoogleFormShell";

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
export default function Login() {
  const { authed } = useGoogleFormAuth();
  const router = useRouter();

  /**
   * 이미 로그인된 상태라면
   * 이 페이지에 머무르지 않고 바로 설문 목록으로 이동
   *
   * UX 포인트:
   * - 로그인 페이지를 잠깐 보여주지 않아 깔끔함
   */
  useEffect(() => {
    if (authed) router.replace("/googleform/forms");
  }, [authed, router]);

  return (
    <div className="mx-auto max-w-md">
      <div className={cardClass({ className: "p-6 sm:p-8" })}>
        <h2 className="text-xl font-semibold tracking-tight text-fg">
          Google 로그인
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          Google Forms 설문과 응답을 불러와 분석합니다.
        </p>

        {/* OAuth2 로그인 시작 버튼 */}
        <Button
          variant="primary"
          size="lg"
          full
          className="mt-6"
          onClick={() => {
            // OAuth2 는 브라우저 리다이렉트 기반 플로우다.
            // 여기서 이동하는 곳은 Next 페이지가 아니라 백엔드 엔드포인트이므로
            // router.push 로는 처리할 수 없다.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = "/api/oauth2/authorization/google";
          }}
        >
          Sign in with Google
        </Button>

        <p className="mt-4 text-xs text-fg-subtle">
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