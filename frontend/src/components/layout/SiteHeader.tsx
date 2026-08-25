"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import ThemeToggle from "@/components/theme/ThemeToggle";
import { PROJECTS, projectAnchorId } from "@/data/projects";
import { cn } from "@/lib/cn";

import ProjectFlyout from "./ProjectFlyout";
import { NAV_ITEMS, NavItem, isActive } from "./nav";

function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="17" height="17" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.05-.13-.36-.95.08-1.98 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.03.13 1.85.08 1.98.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A7.995 7.995 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden
    >
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" />
      )}
    </svg>
  );
}

function navLinkClass(active: boolean) {
  return cn(
    "rounded-control px-3 py-2 text-sm font-medium transition",
    active
      ? "bg-accent-soft text-accent-soft-fg"
      : "text-fg-muted hover:bg-surface-hover hover:text-fg"
  );
}

/**
 * 사이트 공통 헤더 — sticky + 반투명 배경.
 *
 * `actions` 는 영역별 추가 버튼 자리다. `/googleform` 이 로그인 상태와 로그아웃
 * 버튼을 여기에 끼운다. (영역마다 헤더를 새로 만들지 않게 하려는 의도)
 */
export default function SiteHeader({
  actions,
}: {
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const renderLink = (item: NavItem, onNavigate?: () => void) => (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive(pathname, item) ? "page" : undefined}
      className={navLinkClass(isActive(pathname, item))}
    >
      {item.label}
    </Link>
  );

  /**
   * 데스크톱 내비 항목.
   *
   * Project 는 호버 시 프로젝트 목록을 펼친다. 드롭다운은 CSS(group-hover)로만
   * 여닫으므로 상태를 들고 있지 않다 — JS 타이머로 여닫으면 마우스가 항목과
   * 패널 사이를 지날 때 깜빡인다.
   */
  const renderDesktop = (item: NavItem) => {
    if (item.href !== "/project") {
      return <div key={item.href}>{renderLink(item)}</div>;
    }

    return (
      <div key={item.href} className="group/project relative">
        {renderLink(item)}
        <ProjectFlyout />
      </div>
    );
  };

  /*
    헤더에는 main 그룹만 둔다.
    tools(JSON Prettier / Forms 분석)는 완료 상태인 프로젝트 그 자체라
    Project 드롭다운과 중복이었다. 직접 링크는 푸터가 계속 들고 있다.
  */
  const main = NAV_ITEMS.filter((i) => i.group === "main");

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center" aria-label="ELFAKA 홈">
          {/*
            투명 배경 + 라벤더(#a0a0ff) 워드마크라 라이트·다크 양쪽에서 보인다.
            width/height 를 명시해 로드 전 레이아웃이 밀리지 않게 한다.
            (next/image 대신 <img> 인 이유는 eslint.config.mjs 주석 참고)
          */}
          <img
            src="/elfaka.png"
            alt="ELFAKA"
            width={800}
            height={200}
            className="h-7 w-auto transition-transform duration-300 ease-in-out hover:scale-105 sm:h-8"
          />
        </Link>

        {/* 데스크톱 내비 */}
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="주요 메뉴">
          {main.map((i) => renderDesktop(i))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {actions}

          <ThemeToggle />

          <a
            href="https://github.com/elfaka"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="inline-flex size-9 items-center justify-center rounded-control border border-line text-fg-muted transition hover:border-line-strong hover:bg-surface-hover hover:text-fg"
          >
            <GithubIcon />
          </a>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-mobile-nav"
            aria-label="메뉴 열기"
            className="inline-flex size-9 items-center justify-center rounded-control border border-line text-fg-muted transition hover:border-line-strong hover:bg-surface-hover hover:text-fg md:hidden"
          >
            <MenuIcon open={open} />
          </button>
        </div>
      </div>

      {/* 모바일 내비 */}
      {open && (
        <nav
          id="site-mobile-nav"
          aria-label="주요 메뉴"
          className="border-t border-line bg-surface px-4 py-3 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {main.map((i) => (
              <div key={i.href} className="flex flex-col">
                {renderLink(i, () => setOpen(false))}

                {/* 모바일에는 호버가 없다. Project 하위 목록을 그대로 펼쳐 둔다. */}
                {i.href === "/project" && (
                  <ul className="mt-1 ml-3 border-l border-line pl-3">
                    {PROJECTS.map((project) => (
                      <li key={project.id}>
                        <Link
                          href={`/project#${projectAnchorId(project.id)}`}
                          onClick={() => setOpen(false)}
                          className="block truncate rounded-control px-2 py-1.5 text-sm text-fg-muted transition hover:bg-surface-hover hover:text-fg"
                        >
                          {project.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
