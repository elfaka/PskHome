import type { Metadata } from "next";

import Container from "@/components/ui/Container";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";

export const metadata: Metadata = {
  title: "About",
  description: "ELFAKA 소개와 기술 스택.",
};

/*
  ──────────────────────────────────────────────────────────────────────────
  TODO: 아래 3개 배열을 채우면 해당 섹션이 자동으로 나타난다.
        (경력 이력은 이 페이지가 아니라 `/career` 의 CAREER 배열에 쓴다)
        비어 있는 동안에는 "준비 중" 안내만 보인다.

        내용을 모르는 사람이 대신 쓸 수 없는 부분이라 구조만 세워 둔 상태다.
        JSX 를 건드릴 필요 없이 데이터만 추가하면 된다.
  ──────────────────────────────────────────────────────────────────────────
*/

/** 자기소개 문단. 한 원소가 한 단락이다. */
const INTRO: string[] = [
  // TODO: 예) "백엔드를 주로 다루는 개발자입니다. ..."
];

/** 기술 스택. group 은 분류명(언어, 백엔드, 프론트엔드, 인프라 ...) */
const SKILLS: { group: string; items: string[] }[] = [
  // TODO: 예) { group: "백엔드", items: ["Java", "Spring Boot", "Express"] }
];

/** 연락처·외부 링크. */
const LINKS: { label: string; href: string }[] = [
  // TODO: 예) { label: "Email", href: "mailto:..." }
];

const isEmpty =
  INTRO.length === 0 && SKILLS.length === 0 && LINKS.length === 0;

export default function About() {
  return (
    <Container size="prose" className="py-12 sm:py-16">
      <PageHeader
        eyebrow="About"
        title="소개"
        description="어떤 것을 만들어 왔고, 무엇을 다룰 수 있는지 정리한 페이지입니다."
      />

      {isEmpty && (
        <EmptyState
          className="mt-10"
          title="아직 작성 중입니다"
          description="소개 문구와 기술 스택을 정리해 곧 채워둘 예정입니다. 그동안 만든 것은 Project 와 PS 기록에서 볼 수 있습니다."
        />
      )}

      {INTRO.length > 0 && (
        <section className="mt-10 space-y-4">
          {INTRO.map((paragraph) => (
            <p
              key={paragraph}
              className="text-base leading-relaxed text-fg-muted"
            >
              {paragraph}
            </p>
          ))}
        </section>
      )}

      {SKILLS.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold text-fg">기술 스택</h2>

          <div className="mt-4 space-y-4">
            {SKILLS.map((group) => (
              <div key={group.group}>
                <p className="text-xs font-semibold tracking-wider text-fg-subtle uppercase">
                  {group.group}
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <Badge key={item}>{item}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {LINKS.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold text-fg">연락처</h2>

          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent-soft-fg underline-offset-4 hover:underline"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
