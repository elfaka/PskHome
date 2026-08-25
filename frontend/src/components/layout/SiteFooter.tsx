import Link from "next/link";

import { NAV_ITEMS } from "./nav";

/**
 * 사이트 공통 푸터.
 *
 * 기존에는 푸터가 없어서 본문이 화면 끝에서 잘린 듯 끝났다.
 * 마무리 여백과 보조 내비게이션을 담당한다.
 */
export default function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="text-xs text-fg-subtle">
          © ELFAKA — 공부한 흔적과 토이 프로젝트 기록.
        </p>

        <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="푸터 메뉴">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-xs text-fg-muted transition hover:text-fg"
            >
              {item.label}
            </Link>
          ))}

          <a
            href="https://github.com/elfaka"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-fg-muted transition hover:text-fg"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
