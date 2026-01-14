import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Login({ authenticated }: { authenticated: boolean }) {
  const nav = useNavigate();

  useEffect(() => {
    if (authenticated) nav("/googleform/forms");
  }, [authenticated, nav]);

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-extrabold text-zinc-900">Google 로그인</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Google Forms 설문과 응답을 불러와 분석합니다.
        </p>

        <button
          onClick={() => {
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
