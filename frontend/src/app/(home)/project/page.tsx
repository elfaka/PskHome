import type { Metadata } from "next";
import Link from "next/link";

import Badge from "@/components/ui/Badge";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import { cardClass } from "@/components/ui/Card";
import { PROJECTS, PROJECT_STATUS, projectAnchorId } from "@/data/projects";

export const metadata: Metadata = {
  title: "Project",
  description: "만들었거나 만들 예정인 토이 프로젝트 목록.",
};

export default function Project() {
  return (
    <Container className="py-12 sm:py-16">
      <PageHeader
        eyebrow="Project"
        title="토이 프로젝트 목록"
        description="진행 예정인 프로젝트와 진행 중인 프로젝트들을 한 곳에서 정리합니다."
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PROJECTS.map((project) => {
          const status = PROJECT_STATUS[project.status];

          return (
            <article
              key={project.id}
              // 헤더 드롭다운에서 /project#project-N 으로 들어오는 앵커.
              // sticky 헤더에 가리지 않도록 scroll-mt 를 준다.
              id={projectAnchorId(project.id)}
              className={cardClass({
                className: "flex h-full scroll-mt-24 flex-col p-5",
              })}
            >
              <div className="flex items-center justify-between gap-3">
                <Badge tone={status.tone}>{status.label}</Badge>

                <span className="text-xs text-fg-subtle">
                  {project.tags.length} tags
                </span>
              </div>

              <h2 className="mt-3 text-lg font-semibold text-fg">
                {project.title}
              </h2>

              {project.subtitle && (
                <p className="mt-1 text-xs font-medium tracking-wide text-fg-subtle uppercase">
                  {project.subtitle}
                </p>
              )}

              <p className="mt-3 flex-1 text-sm leading-relaxed text-fg-muted">
                {project.description}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {project.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>

              {project.link && (
                <div className="mt-5">
                  {/*
                    같은 사이트 안의 페이지는 next/link 로 이동한다.
                    기존에는 https://elfaka.kr/... 절대주소를 <a> 로 걸어
                    같은 사이트인데도 전체 새로고침이 일어났다.
                  */}
                  {project.link.internal ? (
                    <Link
                      href={project.link.href}
                      className="inline-flex items-center gap-1 text-sm font-medium text-accent-soft-fg underline-offset-4 hover:underline"
                    >
                      자세히 보기 <span aria-hidden>→</span>
                    </Link>
                  ) : (
                    <a
                      href={project.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium text-accent-soft-fg underline-offset-4 hover:underline"
                    >
                      자세히 보기 <span aria-hidden>↗</span>
                    </a>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </Container>
  );
}
