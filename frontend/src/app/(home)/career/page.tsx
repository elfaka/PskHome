import type { Metadata } from "next";
import Link from "next/link";

import Badge from "@/components/ui/Badge";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import { buttonClass } from "@/components/ui/Button";
import { cardClass } from "@/components/ui/Card";
import { CAREER, EDUCATION, FOCUS, SKILLS } from "@/data/profile";

export const metadata: Metadata = {
  title: "Career",
  description: "경력과 학력, 그리고 지금 파고 있는 것들.",
};

/**
 * 타임라인 한 줄.
 *
 * 왼쪽 세로선 + 점으로 시간 흐름을 표현한다. 카드를 그냥 쌓기만 하면
 * "목록"으로 읽히고 순서가 눈에 들어오지 않는다.
 */
function TimelineItem({
  period,
  children,
}: {
  period: string;
  children: React.ReactNode;
}) {
  return (
    /*
      세로선은 li 의 ::before 로 그린다.
      자식 span 에 `last:hidden` 을 걸면 "span 이 마지막 자식인지"를 보게 되어
      마지막 항목 아래로 선이 삐져나온다. 변이 대상은 li 여야 한다.
    */
    <li className="relative pl-8 before:absolute before:top-2 before:left-[5px] before:h-full before:w-px before:bg-line last:before:hidden">
      <span
        aria-hidden
        className="absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-accent bg-bg"
      />

      <p className="font-mono text-xs text-fg-subtle">{period}</p>

      <div className="mt-2">{children}</div>
    </li>
  );
}

export default function Career() {
  return (
    <Container size="prose" className="py-12 sm:py-16">
      <PageHeader
        eyebrow="Career"
        title="경력"
        description="어디에서 무엇을 맡아 왔고, 지금은 무엇을 파고 있는지 정리했습니다."
      />

      {/* 경력 */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-fg">경력</h2>

        <ol className="mt-5 space-y-8">
          {CAREER.map((entry) => (
            <TimelineItem
              key={`${entry.period}-${entry.org}`}
              period={entry.period}
            >
              <article className={cardClass({ className: "p-5 sm:p-6" })}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-fg">
                    {entry.org}
                  </h3>

                  {entry.current && <Badge tone="accent">재직 중</Badge>}
                </div>

                <p className="mt-1 text-sm font-medium text-accent-soft-fg">
                  {entry.role}
                </p>

                {entry.description && (
                  <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                    {entry.description}
                  </p>
                )}

                {entry.highlights && entry.highlights.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {entry.highlights.map((line) => (
                      <li
                        key={line}
                        className="flex gap-2.5 text-sm leading-relaxed text-fg-muted"
                      >
                        <span
                          aria-hidden
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                        />
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
            </TimelineItem>
          ))}
        </ol>
      </section>

      {/* 학력 */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold text-fg">학력</h2>

        <ol className="mt-5 space-y-8">
          {EDUCATION.map((entry) => (
            <TimelineItem
              key={`${entry.period}-${entry.org}`}
              period={entry.period}
            >
              <div className={cardClass({ className: "p-5" })}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-fg">{entry.org}</h3>

                  {entry.note && <Badge>{entry.note}</Badge>}
                </div>
              </div>
            </TimelineItem>
          ))}
        </ol>
      </section>

      {/* 지금 파고 있는 것 */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold text-fg">지금 파고 있는 것</h2>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {FOCUS.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2.5 rounded-control border border-line bg-surface px-4 py-3 text-sm text-fg-muted"
            >
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-accent"
              />
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* 다루는 기술 — About 과 같은 목록을 쓰되 여기서는 한 줄로 압축한다 */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold text-fg">다루는 기술</h2>

        <div className="mt-4 flex flex-wrap gap-2">
          {SKILLS.flatMap((group) => group.items).map((item) => (
            <Badge key={item}>{item}</Badge>
          ))}
        </div>

        <div
          className={cardClass({
            className:
              "mt-6 flex flex-wrap items-center justify-between gap-3 p-5",
          })}
        >
          <p className="text-sm text-fg-muted">
            분류별 스택과 소개는 About 에 있습니다.
          </p>

          <Link href="/about" className={buttonClass()}>
            About 보기
          </Link>
        </div>
      </section>
    </Container>
  );
}
