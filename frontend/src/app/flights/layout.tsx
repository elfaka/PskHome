import type { Metadata } from "next";

import SiteShell from "@/components/layout/SiteShell";

export const metadata: Metadata = {
  title: "항공권 최저가 검색",
  description: "출발지·도착지·출발일로 Google 항공편 실시간 결과를 가격순으로 보여주는 항공권 최저가 검색 도구입니다.",
};

export default function FlightsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteShell>{children}</SiteShell>;
}
