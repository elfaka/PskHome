import type { Metadata } from "next";

import ThemeScript from "@/components/theme/ThemeScript";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ELFAKA Dev log",
    template: "%s · ELFAKA",
  },
  description:
    "공부한 흔적과 토이 프로젝트를 기록하는 개인 사이트. PS 풀이, JSON Prettier, Google Forms 분석 도구.",
  icons: {
    icon: "/alpaca.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /*
      data-theme 은 ThemeScript 가 React 밖에서 심는다.
      서버 HTML 에는 없는 속성이므로 hydration 경고를 suppress 한다.
    */
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen bg-bg font-sans text-fg antialiased">
        {/* 폰트 CDN 핸드셰이크를 미리 뚫어 첫 글자 렌더를 앞당긴다 (React 19 가 head 로 hoist 한다) */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <ThemeScript />
        {children}
      </body>
    </html>
  );
}
