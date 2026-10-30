import type { Metadata } from "next";

import SiteShell from "@/components/layout/SiteShell";

export const metadata: Metadata = {
  title: "주식 모의투자",
  description: "토스증권 실시세로 국내 주식을 가상 매수·매도해 보는 모의투자 시뮬레이터입니다.",
};

export default function StockSimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteShell>{children}</SiteShell>;
}
