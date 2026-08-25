import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

/**
 * 헤더 + 본문 + 푸터 골격.
 *
 * 기존 `(home)/layout.tsx` 는 `h-[100dvh] overflow-hidden` 으로 화면을 고정하고
 * 본문 div 만 스크롤시켰다. 그래서 sticky 헤더가 동작하지 않고, 모바일에서
 * 주소창이 접힐 때 높이가 어긋났다. 여기서는 문서 자체를 스크롤한다.
 *
 * `headerActions` 는 영역별 헤더 우측 슬롯이다 (`/googleform` 의 로그인 상태 등).
 */
export default function SiteShell({
  headerActions,
  children,
}: {
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader actions={headerActions} />

      <main className="flex-1">{children}</main>

      <SiteFooter />
    </div>
  );
}
