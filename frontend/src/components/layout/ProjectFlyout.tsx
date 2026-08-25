import Link from "next/link";

import Badge from "@/components/ui/Badge";
import { PROJECTS, PROJECT_STATUS, projectAnchorId } from "@/data/projects";

/**
 * 헤더 Project 항목의 호버 드롭다운.
 *
 * 마우스를 얹으면 프로젝트 목록이 펼쳐지고, 각 항목은 `/project` 의 해당 카드로
 * 딥링크한다. 키보드 사용자를 위해 hover 뿐 아니라 focus-within 으로도 열린다
 * (`group-focus-within/project`) — hover 만 걸면 탭 이동으로는 열 수 없다.
 * Project 링크 자체는 패널 밖에 있으므로, 그 링크에 포커스가 닿으면 패널이 열리고
 * 이어지는 tab 이 패널 안쪽 링크로 들어간다.
 *
 * `hidden`(display:none) 대신 `invisible` + `opacity-0` 으로 감추는 이유는
 * 열릴 때 페이드 전환을 주기 위해서다. visibility:hidden 이라 닫힌 동안에는
 * 접근성 트리와 tab 순서에서 함께 빠진다.
 */
export default function ProjectFlyout() {
  return (
    <div
      // 항목과 패널 사이에 마우스가 지나갈 여백(pt-2)을 둔다.
      // 여백이 없으면 내려가는 도중 hover 가 끊겨 패널이 닫힌다.
      className="invisible absolute top-full left-0 z-50 pt-2 opacity-0 transition group-focus-within/project:visible group-focus-within/project:opacity-100 group-hover/project:visible group-hover/project:opacity-100"
    >
      <div className="w-80 overflow-hidden rounded-card border border-line bg-surface shadow-overlay">
        <ul className="p-1.5">
          {PROJECTS.map((project) => {
            const status = PROJECT_STATUS[project.status];

            return (
              <li key={project.id}>
                <Link
                  href={`/project#${projectAnchorId(project.id)}`}
                  className="block rounded-control px-3 py-2.5 transition hover:bg-surface-hover"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-sm font-medium text-fg">
                      {project.title}
                    </span>

                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>

                  {project.subtitle && (
                    <span className="mt-0.5 block truncate text-xs text-fg-subtle">
                      {project.subtitle}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-line px-4 py-2.5">
          <Link
            href="/project"
            className="text-xs font-medium text-accent-soft-fg underline-offset-4 hover:underline"
          >
            전체 목록 보기 <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
