import type { Metadata } from "next";

import "./globals.css";

/**
 * 루트 레이아웃 — 기존 `index.html` + `main.tsx` + `App.tsx` 의 공통 래퍼를 대신한다.
 */
export const metadata: Metadata = {
  title: "ELPAKA Dev log",
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
    <html lang="ko">
      <body className="max-w-full min-h-screen mx-auto bg-[#ffffef]">
        {children}
      </body>
    </html>
  );
}
