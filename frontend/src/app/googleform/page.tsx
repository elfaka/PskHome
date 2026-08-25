"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useGoogleFormAuth } from "@/components/googleform/GoogleFormShell";

/**
 * `/googleform` 루트 — 로그인 여부에 따라 분기한다.
 * (기존 `<Route path="" element={<Navigate to={authed ? "/googleform/forms" : "/googleform/login"} replace />} />`)
 */
export default function GoogleFormIndexPage() {
  const { authed } = useGoogleFormAuth();
  const router = useRouter();

  useEffect(() => {
    router.replace(authed ? "/googleform/forms" : "/googleform/login");
  }, [authed, router]);

  return null;
}
