import type { Metadata } from "next";

import SiteShell from "@/components/layout/SiteShell";

/**
 * 기존에는 페이지에서 `document.title` 을 직접 세팅했다.
 * App Router 에서는 레이아웃의 metadata 로 선언해 서버 렌더링 시점부터 제목이 맞도록 한다.
 */
export const metadata: Metadata = {
  title: "JSON Prettier",
  description: "JSON 을 검증하고 포맷팅(prettify) 또는 압축(minify) 합니다.",
};

export default function JsonPrettierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 이 영역에는 헤더가 아예 없어서 다른 화면으로 나갈 길이 없었다. 공통 껍데기를 씌운다.
  return <SiteShell>{children}</SiteShell>;
}
