"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { api } from "@/api/client";
import Container from "@/components/ui/Container";
import SiteShell from "@/components/layout/SiteShell";
import Skeleton from "@/components/ui/Skeleton";
import { buttonClass } from "@/components/ui/Button";

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
 * `/googleform/*` 영역의 공통 껍데기.
 *
 * [역할]
 * - 로그인 상태를 한 번만 확인해 하위 화면에 제공한다 (각 페이지에서 중복 체크하지 않는다)
 * - 로그인 상태 표시/로그아웃 버튼을 공통 헤더 슬롯에 끼운다
 *
 * 이 영역만 쓰던 별도 헤더(← Home + GoogleForm Analyzer)는 없앴다.
 * 사이트 전역 헤더와 역할이 겹쳐서 영역을 넘나들 때 상단이 통째로 바뀌어 보였다.
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
      <SiteShell>
        <Container size="wide" className="py-10">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="mt-3 h-5 w-72" />
          <Skeleton className="mt-8 h-40 w-full rounded-card" />
        </Container>
      </SiteShell>
    );
  }

  const headerActions = authed ? (
    <>
      {/* 로그인 사용자 표시 — 좁은 화면에서는 이름을 감춘다 */}
      <span className="hidden max-w-32 truncate text-sm text-fg-muted sm:inline">
        {me?.name}
      </span>

      <button
        onClick={logout}
        className={buttonClass({ variant: "secondary", size: "sm" })}
      >
        Logout
      </button>
    </>
  ) : null;

  return (
    <AuthContext value={{ authed, name: me?.name, logout }}>
      <SiteShell headerActions={headerActions}>
        <Container size="wide" className="py-8 sm:py-10">
          {children}
        </Container>
      </SiteShell>
    </AuthContext>
  );
}

/**
 * 인증이 필요한 화면을 감싸는 게이트.
 * 미인증이면 로그인 페이지로 돌려보낸다.
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
