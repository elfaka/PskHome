import type { Metadata } from "next";

/*
  자동매매 — 본인 전용. 사이트 메뉴·프로젝트 목록·sitemap 어디에도 링크하지 않는다.
  보호는 백엔드 로그인(/api/trader/**)이 하고, 여기서는 검색 노출만 막는다.
*/
export const metadata: Metadata = {
  title: { absolute: "로그인" },
  robots: { index: false, follow: false, nocache: true },
};

export default function TraderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
