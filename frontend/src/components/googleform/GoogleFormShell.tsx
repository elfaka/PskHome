"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { api } from "@/api/client";

/**
 * `/api/auth/me` 응답
 * - authenticated: 세션 로그인 여부
 * - name: 로그인 사용자 표시용(헤더)
 */
type Me = { authenticated: boolean; name?: string };

type GoogleFormAuth = {
  authed: boolean;
  name?: string;
  logout: () => Promise<void>;
};

const AuthContext = createContext<GoogleFormAuth | null>(null);

export function useGoogleFormAuth(): GoogleFormAuth {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useGoogleFormAuth must be used inside GoogleFormShell");
  }

  return ctx;
}

/**
 * `/googleform/*` 영역의 공통 껍데기 — 기존 `pages/googleform/googleform.tsx`.
 *
 * [역할]
 * - 로그인 상태를 한 번만 확인해 하위 화면에 제공한다 (각 페이지에서 중복 체크하지 않는다)
 * - 공통 헤더(홈 링크 / 로그인·로그아웃) 제공
 *
 * 라우팅 분기는 App Router 의 파일 라우팅이 담당하고,
 * 인증 게이트는 `RequireGoogleFormAuth` 가 담당한다.
 */
export default function GoogleFormShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const authed = !!me?.authenticated;

  /**
   * 로그인 상태 조회.
   * `/api/auth/me` 는 공개 엔드포인트라 로그인 전에도 호출할 수 있다.
   * 최초 진입 시 화면 깜빡임을 줄이려고 loading 으로 감싼다.
   */
  const loadMe = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Me>("/api/auth/me");
      setMe(res.data);
    } catch {
      // 네트워크 오류나 인증 만료는 로그아웃 상태로 간주한다.
      setMe({ authenticated: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  /**
   * 로그아웃 — 백엔드 세션을 무효화하고 상태를 최신화한 뒤 로그인 페이지로 이동한다.
   * 호출이 실패하더라도 finally 에서 UI 상태를 정리한다.
   */
  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } finally {
      await loadMe();
      router.push("/googleform/login");
    }
  }, [loadMe, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#ffffef]">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700 shadow-sm">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ authed, name: me?.name, logout }}>
      <div className="min-h-screen bg-[#ffffef]">
        <div className="mx-auto max-w-6xl px-4 py-6">
          {/* ======================================================
             공통 헤더 영역
             - GoogleForm Analyzer 홈 링크
             - 로그인 상태에 따른 Login/Logout 버튼
          ====================================================== */}
          <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* 메인 홈으로 복귀 */}
              <Link
                href="/"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
              >
                ← Home
              </Link>

              {/* 구글폼 루트(authed 여부에 따라 forms 또는 login 으로 유도) */}
              <Link
                href={authed ? "/googleform/forms" : "/googleform/login"}
                className="text-lg font-black tracking-tight text-zinc-900"
              >
                GoogleForm Analyzer
              </Link>
            </div>

            <div className="flex items-center gap-3">
              {authed ? (
                <>
                  {/* 로그인 사용자 표시 */}
                  <span className="text-sm text-zinc-600">{me?.name}</span>

                  {/* 로그아웃 */}
                  <button
                    onClick={logout}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 active:scale-[0.99]"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <Link
                  href="/googleform/login"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
                >
                  Login
                </Link>
              )}
            </div>
          </header>

          {children}
        </div>
      </div>
    </AuthContext.Provider>
  );
}

/**
 * 인증이 필요한 화면을 감싸는 게이트.
 * 기존 `<Route element={authed ? <FormsList/> : <Navigate to="/googleform/login" replace />} />` 대응.
 */
export function RequireGoogleFormAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  const { authed } = useGoogleFormAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authed) router.replace("/googleform/login");
  }, [authed, router]);

  if (!authed) return null;

  return <>{children}</>;
}
