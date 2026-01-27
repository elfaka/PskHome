import { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";

import Login from "./Login/Login";
import FormsList from "./FormsList/FormsList";
import AnalyzePage from "./AnalyzePage/AnalyzePage";

/**
 * /api/auth/me 응답 타입
 * - authenticated: 세션 로그인 여부
 * - name: 로그인 사용자 표시용(헤더)
 */
type Me = { authenticated: boolean; name?: string };

/**
 * GoogleForm (pages/googleform/googleform.tsx)
 *
 * [역할]
 * - /googleform/* 영역의 "라우팅 엔트리"
 * - 로그인 상태 체크 + 인증이 필요한 페이지 접근 제어(게이트 역할)
 * - 공통 헤더(UI) 제공
 *
 * [흐름]
 * 1) 마운트 시 /api/auth/me 호출 → 로그인 상태 확인
 * 2) authed 여부에 따라 라우트 접근 제어
 * 3) 로그아웃 시 /api/auth/logout 호출 후 다시 me 조회 → 로그인 페이지로 이동
 *
 * [왜 여기서 auth 체크?]
 * - /googleform 하위 화면들이 공통으로 "로그인 여부"가 필요함
 * - 각 페이지에서 중복 체크하지 않고, 엔트리에서 한 번만 확인해서 단순화
 *
 * [권장]
 * - 컴포넌트 이름은 대문자 시작이 관례(React DevTools에서도 보기 좋아짐)
 */
export default function GoogleForm() {
  // 로그인 사용자 정보
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    document.title = "GoogleForm Analyzer";
  }, []);
  // 로그인 상태 확인 중 로딩 표시용
  const [loading, setLoading] = useState(true);

  // 코드 기반 라우팅 이동(로그아웃 후 이동 등)
  const nav = useNavigate();

  // 인증 여부 boolean (me가 null일 수 있으니 안전하게 처리)
  const authed = !!me?.authenticated;

  /**
   * 로그인 상태 조회
   *
   * - 백엔드 /api/auth/me는 permitAll이라 로그인 전에도 호출 가능
   * - 로그인 되어 있으면 { authenticated: true, name: ... }
   * - 아니면 { authenticated: false }
   *
   * UX 포인트:
   * - 최초 진입 시 화면 깜빡임을 줄이기 위해 loading 상태로 감싼다.
   */
  async function loadMe() {
    setLoading(true);
    try {
      const res = await api.get("/api/auth/me");
      setMe(res.data);
    } catch {
      // 네트워크 오류 또는 인증 만료 등 예외 상황에서는 로그아웃 상태로 간주
      setMe({ authenticated: false });
    } finally {
      setLoading(false);
    }
  }

  /**
   * 로그아웃 처리
   *
   * - 백엔드 세션(JSESSIONID)을 무효화
   * - 로그아웃 이후 me를 다시 조회해 상태를 최신화
   * - 마지막에 /googleform/login으로 이동
   *
   * 주의:
   * - logout 호출이 실패하더라도 finally에서 UI 상태를 안전하게 정리
   */
  async function logout() {
    try {
      await api.post("/api/auth/logout");
    } finally {
      await loadMe();
      nav("/googleform/login");
    }
  }

  /**
   * 컴포넌트 마운트 시 로그인 상태 1회 로드
   * - 의존성 배열 []: 첫 렌더 시 한 번만 호출
   */
  useEffect(() => {
    loadMe();
  }, []);

  /**
   * 로딩 중 화면
   * - 로그인 상태 확인이 끝나기 전에는 라우팅 분기가 확정되지 않으므로
   *   중간 깜빡임 방지를 위해 로딩 UI를 먼저 표시
   */
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
              to="/"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              ← Home
            </Link>

            {/* 구글폼 루트(authed 여부에 따라 forms 또는 login으로 유도) */}
            <Link
              to={authed ? "/googleform/forms" : "/googleform/login"}
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
                to="/googleform/login"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
              >
                Login
              </Link>
            )}
          </div>
        </header>

        {/* ======================================================
           내부 라우팅 (/googleform/*)
           - login: 로그인 페이지(항상 접근 가능)
           - forms: 설문 목록(인증 필요)
           - analyze: 분석 페이지(인증 필요)
        ====================================================== */}
        <Routes>
          {/* /googleform/login */}
          <Route path="login" element={<Login authenticated={authed} />} />

          {/* /googleform/forms (인증 필요) */}
          <Route
            path="forms"
            element={authed ? <FormsList /> : <Navigate to="/googleform/login" replace />}
          />

          {/* /googleform/forms/:formId/analyze (인증 필요) */}
          <Route
            path="forms/:formId/analyze"
            element={authed ? <AnalyzePage /> : <Navigate to="/googleform/login" replace />}
          />

          {/* /googleform (루트 진입 시 authed에 따라 분기) */}
          <Route
            path=""
            element={<Navigate to={authed ? "/googleform/forms" : "/googleform/login"} replace />}
          />

          {/* 그 외 경로는 루트로 되돌림 */}
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </div>
    </div>
  );
}
