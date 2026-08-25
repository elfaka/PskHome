import type { Metadata } from "next";
import Link from "next/link";

import Badge from "@/components/ui/Badge";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import { buttonClass } from "@/components/ui/Button";
import { cardClass } from "@/components/ui/Card";
import { INTRO, LINKS, SKILLS, SUMMARY, TAGLINE } from "@/data/profile";

export const metadata: Metadata = {
  title: "About",
  description: "ELFAKA 소개와 기술 스택.",
};

export default function About() {
  return (
    <Container size="prose" className="py-12 sm:py-16">
      <PageHeader eyebrow="About" title="소개" description={TAGLINE} />

      {/* 요약 스트립 — 본문을 읽지 않아도 소속·학력·관심이 먼저 보이게 한다 */}
      <dl className="mt-8 grid gap-3 sm:grid-cols-3">
        {SUMMARY.map((item) => (
          <div key={item.label} className={cardClass({ className: "p-4" })}>
            <dt className="text-xs font-semibold tracking-wider text-fg-subtle uppercase">
              {item.label}
            </dt>

            <dd className="mt-1.5">
              <span className="block text-sm font-medium text-fg">
                {item.value}
              </span>

              {item.sub && (
                <span className="mt-0.5 block font-mono text-xs text-fg-subtle">
                  {item.sub}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {/* 소개 문단 */}
      <section className="mt-12 space-y-4">
        {INTRO.map((paragraph) => (
          <p
            key={paragraph}
            className="text-base leading-relaxed text-fg-muted"
          >
            {paragraph}
          </p>
        ))}
      </section>

      {/* 기술 스택 */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold text-fg">기술 스택</h2>

        <div className="mt-5 space-y-5">
          {SKILLS.map((group) => (
            <div key={group.group}>
              <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-fg-subtle uppercase">
                {/* accent 점으로 분류 구분 — 색을 늘리지 않고 시선만 잡아준다 */}
                <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                {group.group}
              </p>

              <div className="mt-2.5 flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <Badge key={item}>{item}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 경력은 별도 페이지로 — 여기서는 길을 열어만 준다 */}
      <section className="mt-12">
        <div
          className={cardClass({
            className:
              "flex flex-wrap items-center justify-between gap-3 p-5",
          })}
        >
          <div>
            <p className="text-sm font-medium text-fg">
              어디에서 무엇을 맡아 왔는지
            </p>

            <p className="mt-1 text-sm text-fg-muted">
              경력과 학력은 Career 에 정리해 두었습니다.
            </p>
          </div>

          <Link href="/career" className={buttonClass()}>
            Career 보기
          </Link>
        </div>
      </section>

      {/* 연락처 */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold text-fg">연락처</h2>

        <div className="mt-4 flex flex-wrap gap-2">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              // mailto 는 새 탭이 의미 없고, 외부 링크만 새 탭으로 연다.
              target={link.href.startsWith("http") ? "_blank" : undefined}
              rel={
                link.href.startsWith("http")
                  ? "noopener noreferrer"
                  : undefined
              }
              className={buttonClass({ className: "gap-2" })}
            >
              {link.label}

              {link.hint && (
                <span className="font-mono text-xs text-fg-subtle">
                  {link.hint}
                </span>
              )}
            </a>
          ))}
        </div>
      </section>
    </Container>
  );
}
