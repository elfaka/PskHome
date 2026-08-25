import type { Metadata } from "next";

/**
 * 기존에는 페이지에서 `document.title` 을 직접 세팅했다.
 * App Router 에서는 레이아웃의 metadata 로 선언해 서버 렌더링 시점부터 제목이 맞도록 한다.
 */
export const metadata: Metadata = {
  title: "JSON Prettier",
};

export default function JsonPrettierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
