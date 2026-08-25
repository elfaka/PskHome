import type { Metadata } from "next";
import Link from "next/link";

import Badge, { BadgeTone } from "@/components/ui/Badge";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import { cardClass } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Project",
  description: "만들었거나 만들 예정인 토이 프로젝트 목록.",
};

type ProjectInfo = {
  id: number;
  title: string;
  subtitle?: string;
  description: string;
  status: "planning" | "in-progress" | "done";
  tags: string[];
  /** 이 사이트 안의 경로면 internal, 외부 주소면 external */
  link?: { href: string; internal?: boolean };
};

/*
  스택 표기는 실제 구현 스택을 따른다.
  이 저장소는 Express(백엔드) + Next.js(프론트엔드) 다 —
  기존 목록에 남아 있던 "Spring Boot", "React" 는 프레임워크 이관 전의 잔재였다.
*/
const projects: ProjectInfo[] = [
  {
    id: 1,
    title: "구글폼 설문 간편 분석 도구",
    subtitle: "Google Forms API 기반 설문 분석 페이지",
    description:
      "Google Forms API를 활용해 설문 응답 데이터를 불러오고, 응답 수·문항별 응답 분포 등을 표와 그래프로 간편하게 확인할 수 있는 웹 페이지입니다. 설문 소유자가 폼 ID 또는 응답 스프레드시트 정보를 등록하면, 별도 엑셀 작업 없이도 기본적인 통계를 바로 볼 수 있도록 하는 것을 목표로 합니다.",
    status: "done",
    tags: ["Google Forms API", "Express", "Next.js", "Data Visualization"],
    link: { href: "/googleform", internal: true },
  },
  {
    id: 2,
    title: "운동 · 체중 기록 서비스",
    subtitle: "Fitness Tracker (Toy Project)",
    description:
      "하루 운동 기록과 체중 변화를 저장하고, 기간별 변화를 확인할 수 있는 간단한 웹 서비스입니다. Express + Next.js + MySQL 기반으로 구현하여, 개인의 운동 루틴과 체중 관리를 돕는 것을 목표로 합니다.",
    status: "planning",
    tags: ["Express", "Next.js", "MySQL", "Toy Project"],
  },
  {
    id: 3,
    title: "적립식 투자 시뮬레이터",
    subtitle: "SIP Simulator",
    description:
      "월 적립식 투자 금액, 기간, 예상 수익률을 기준으로 목표 금액과 예상 성과를 계산해 보는 시뮬레이터입니다. 단순 계산을 넘어, 여러 시나리오를 저장하고 비교할 수 있는 기능까지 확장하는 것을 목표로 합니다.",
    status: "planning",
    tags: ["Express", "Next.js", "Finance"],
  },
  {
    id: 4,
    title: "JSON Prettier",
    subtitle: "JSON Formatter & Validator (Toy Project)",
    description:
      "JSON 문자열을 입력하면 가독성 좋은 형태로 포맷팅(pretty print)해주고, 문법 오류를 검증해주는 간단한 웹 도구입니다. Next.js(TypeScript) 기반 UI와 Express API를 활용하여 JSON 파싱, 정렬 옵션, 에러 위치 표시 등의 기능을 제공합니다.",
    status: "done",
    tags: ["Next.js", "TypeScript", "Express", "JSON", "Toy Project"],
    link: { href: "/jsonprettier", internal: true },
  },
];

const STATUS: Record<
  ProjectInfo["status"],
  { label: string; tone: BadgeTone }
> = {
  planning: { label: "기획 중", tone: "warning" },
  "in-progress": { label: "진행 중", tone: "info" },
  done: { label: "완료", tone: "success" },
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
        {projects.map((project) => {
          const status = STATUS[project.status];

          return (
            <article
              key={project.id}
              className={cardClass({ className: "flex h-full flex-col p-5" })}
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
