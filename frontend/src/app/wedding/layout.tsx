import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Pinyon_Script } from "next/font/google";

import { wedding } from "@/data/wedding";
import { parseCeremonyDate, WEEKDAYS_KO } from "@/lib/wedding/ceremony";

const script = Pinyon_Script({
  weight: "400",
  subsets: ["latin"],
  variable: "--wd-font-script",
  display: "swap",
});

const display = Cormorant_Garamond({
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--wd-font-display",
  display: "swap",
});

const date = parseCeremonyDate(wedding.ceremony.date);
const title = `${wedding.groom.name} ♥ ${wedding.bride.name} 결혼합니다`;
const description = `${date.year}년 ${date.month}월 ${date.day}일 ${WEEKDAYS_KO[date.weekday]}요일 · ${wedding.venue.name}`;

export const metadata: Metadata = {
  // 루트의 "%s · ELFAKA" 템플릿을 붙이지 않는다
  title: { absolute: title },
  description,
  // 개인 청첩장 — 검색 노출 금지
  robots: { index: false, follow: false },
  // iOS 가 날짜·숫자를 전화번호 링크로 바꾸지 않게 한다
  formatDetection: { telephone: false, address: false, email: false },
  openGraph: { title, description, type: "website", locale: "ko_KR" },
};

export const viewport: Viewport = {
  // env(safe-area-inset-*) 가 0 이 아니려면 cover 여야 한다 (노치·폴더블 커버 펀치홀)
  viewportFit: "cover",
  themeColor: "#f7f5ef",
};

/*
  JS 가 없거나 실패하면 봉투를 누를 수 없다.
  그때는 봉인 전용 요소(문구·안내·칼라)를 숨기고, 카드·꽃·사진·LP 와 스크롤 진입 요소의
  초기 상태(투명·이동)를 풀어 열린 장면과 본문을 바로 보여준다.
*/
const NOSCRIPT_STYLE =
  "<style>.wd-sealed-only{display:none!important}.wd-reveal{opacity:1!important;transform:none!important}</style>";

export default function WeddingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`wedding-root font-wd-serif ${script.variable} ${display.variable}`}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/*
        next/font/google 은 한글 서브셋이 없어 Noto Serif KR 은 Google Fonts CSS(unicode-range 분할)로 받는다.
        이 라우트에서만 쓰는 폰트라 전역 CSS 에 올려 모든 페이지를 막지 않는다.
      */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- 위 사유. pages/_document 전용 규칙이다 */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;600&display=swap"
        precedence="default"
      />
      <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT_STYLE }} />
      {children}
    </div>
  );
}
