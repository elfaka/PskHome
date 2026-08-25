/**
 * 사이트 전역 내비게이션 정의.
 *
 * 기존 헤더에는 링크가 아예 없어서 `/pspost`, `/jsonprettier`, `/googleform` 으로
 * 가려면 홈 본문의 텍스트 링크를 거쳐야 했다. 목적지를 한곳에 모아둔다.
 */
export type NavItem = {
  href: string;
  label: string;
  /** 하위 경로까지 활성으로 볼지 (예: /pspost/12 에서도 PS 가 활성) */
  section?: boolean;
  /**
   * main: 헤더 + 푸터에 노출
   * tools: 푸터에만 노출 — 완료 상태 프로젝트라 헤더에서는 Project 드롭다운이 대신한다
   */
  group: "main" | "tools";
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", group: "main" },
  { href: "/about", label: "About", group: "main" },
  { href: "/pspost", label: "PS", section: true, group: "main" },
  { href: "/project", label: "Project", group: "main" },
  { href: "/jsonprettier", label: "JSON Prettier", section: true, group: "tools" },
  { href: "/googleform", label: "Forms 분석", section: true, group: "tools" },
];

/** 현재 경로가 해당 항목에 해당하는지. */
export function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/") return pathname === "/";
  if (item.section) return pathname === item.href || pathname.startsWith(`${item.href}/`);
  return pathname === item.href;
}
