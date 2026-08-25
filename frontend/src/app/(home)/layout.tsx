import Homeheader from "@/components/layout/Homeheader/Homeheader";

/**
 * 홈 영역 공통 레이아웃 — 기존 `pages/home/home.tsx` 의 껍데기.
 * 헤더는 고정하고 본문만 스크롤한다.
 */
export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">
      {/* Homeheader: 고정 영역 */}
      <div className="shrink-0">
        <Homeheader />
      </div>

      {/* HomeBody: 본문 영역 (스크롤 가능) */}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
