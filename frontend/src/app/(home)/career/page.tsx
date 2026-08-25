import type { Metadata } from "next";

import Badge from "@/components/ui/Badge";
import Container from "@/components/ui/Container";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { cardClass } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Career",
  description: "경력과 활동 이력.",
};

/*
  ──────────────────────────────────────────────────────────────────────────
  TODO: 아래 CAREER 배열을 채우면 이력이 최신순으로 나타난다.
        비어 있는 동안에는 "준비 중" 안내만 보인다.

        내용을 모르는 사람이 대신 쓸 수 없는 부분이라 구조만 세워 둔 상태다.
        JSX 를 건드릴 필요 없이 데이터만 추가하면 된다.
  ──────────────────────────────────────────────────────────────────────────
*/

type CareerEntry = {
  /** 예: "2023.03 — 현재" */
  period: string;
  /** 회사 / 기관 / 활동명 */
  org: string;
  /** 직무 또는 역할 */
  role: string;
  description?: string;
  /** 한 줄씩 나열되는 주요 업무·성과 */
  highlights?: string[];
  /** 사용한 기술 */
  tags?: string[];
  /** 재직 중이면 true — 배지로 표시한다 */
  current?: boolean;
};

/** 최신순으로 둔다. */
const CAREER: CareerEntry[] = [
  // TODO: 예)
  // {
  //   period: "2023.03 — 현재",
  //   org: "○○○",
  //   role: "백엔드 개발",
  //   description: "...",
  //   highlights: ["...", "..."],
  //   tags: ["Java", "Spring Boot"],
  //   current: true,
  // },
];

export default function Career() {
  return (
    <Container size="prose" className="py-12 sm:py-16">
      <PageHeader
        eyebrow="Career"
        title="경력"
        description="어디에서 무엇을 맡아 왔는지 시간순으로 정리한 페이지입니다."
      />

      {CAREER.length === 0 ? (
        <EmptyState
          className="mt-10"
          title="아직 작성 중입니다"
          description="경력 사항을 정리해 곧 채워둘 예정입니다. 그동안 만든 것은 Project 와 PS 기록에서 볼 수 있습니다."
        />
      ) : (
        <ol className="mt-10 space-y-4">
          {CAREER.map((entry) => (
            <li key={`${entry.period}-${entry.org}`}>
              <article className={cardClass({ className: "p-5 sm:p-6" })}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-xs text-fg-subtle">
                    {entry.period}
                  </p>

                  {entry.current && <Badge tone="accent">재직 중</Badge>}
                </div>

                <h2 className="mt-2 text-lg font-semibold text-fg">
                  {entry.org}
                </h2>

                <p className="mt-0.5 text-sm text-accent-soft-fg">
                  {entry.role}
                </p>

                {entry.description && (
                  <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                    {entry.description}
                  </p>
                )}

                {entry.highlights && entry.highlights.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {entry.highlights.map((line) => (
                      <li
                        key={line}
                        className="flex gap-2 text-sm leading-relaxed text-fg-muted"
                      >
                        <span aria-hidden className="text-fg-subtle">
                          ·
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {entry.tags && entry.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {entry.tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                )}
              </article>
            </li>
          ))}
        </ol>
      )}
    </Container>
  );
}
