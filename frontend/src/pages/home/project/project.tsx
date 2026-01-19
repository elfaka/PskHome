// src/pages/home/project/project.tsx

type ProjectInfo = {
  id: number;
  title: string;
  subtitle?: string;
  description: string;
  status: "planning" | "in-progress" | "done";
  tags: string[];
  link?: string; // GitHub나 배포 링크
};

const projects: ProjectInfo[] = [
  {
    id: 1,
    title: "구글폼 설문 간편 분석 도구",
    subtitle: "Google Forms API 기반 설문 분석 페이지",
    description:
      "Google Forms API를 활용해 설문 응답 데이터를 불러오고, 응답 수·문항별 응답 분포 등을 표와 그래프로 간편하게 확인할 수 있는 웹 페이지입니다. 설문 소유자가 폼 ID 또는 응답 스프레드시트 정보를 등록하면, 별도 엑셀 작업 없이도 기본적인 통계를 바로 볼 수 있도록 하는 것을 목표로 합니다.",
    status: "done",
    tags: ["Google Forms API", "Spring Boot", "React", "Data Visualization"],
    link: "https://elfaka.kr/googleform/login",
  },
  {
    id: 2,
    title: "운동 · 체중 기록 서비스",
    subtitle: "Fitness Tracker (Toy Project)",
    description:
      "하루 운동 기록과 체중 변화를 저장하고, 기간별 변화를 확인할 수 있는 간단한 웹 서비스입니다. Spring Boot + React + MySQL 기반으로 구현하여, 개인의 운동 루틴과 체중 관리를 돕는 것을 목표로 합니다.",
    status: "planning",
    tags: ["Spring Boot", "React", "MySQL", "Toy Project"],
  },
  {
    id: 3,
    title: "적립식 투자 시뮬레이터",
    subtitle: "SIP Simulator",
    description:
      "월 적립식 투자 금액, 기간, 예상 수익률을 기준으로 목표 금액과 예상 성과를 계산해 보는 시뮬레이터입니다. 단순 계산을 넘어, 여러 시나리오를 저장하고 비교할 수 있는 기능까지 확장하는 것을 목표로 합니다.",
    status: "planning",
    tags: ["Spring Boot", "React", "Finance"],
  },
  {
    id: 4,
    title: "JSON Prettier",
    subtitle: "JSON Formatter & Validator (Toy Project)",
    description:
      "JSON 문자열을 입력하면 가독성 좋은 형태로 포맷팅(pretty print)해주고, 문법 오류를 검증해주는 간단한 웹 도구입니다. React(TypeScript) 기반 UI와 Spring Boot API를 활용하여 JSON 파싱, 정렬 옵션, 에러 위치 표시 등의 기능을 제공하는 것을 목표로 합니다.",
    status: "planning",
    tags: ["React", "TypeScript", "Spring Boot", "JSON", "Toy Project"],
    // link: "https://..." // 추후 배포 또는 GitHub 링크
  },
];


function getStatusLabel(status: ProjectInfo["status"]) {
  switch (status) {
    case "planning":
      return "기획 중";
    case "in-progress":
      return "진행 중";
    case "done":
      return "완료";
  }
}

function getStatusColor(status: ProjectInfo["status"]) {
  switch (status) {
    case "planning":
      return "bg-amber-100 text-amber-700";
    case "in-progress":
      return "bg-sky-100 text-sky-700";
    case "done":
      return "bg-emerald-100 text-emerald-700";
  }
}

export default function Project() {
  return (
    <div className="px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto max-w-5xl">
        {/* 제목 영역 */}
        <header className="mb-6 border-b border-slate-200 pb-4">
          <h1 className="text-2xl font-semibold md:text-3xl">
            토이 프로젝트 목록
          </h1>
          <p className="mt-2 text-sm text-slate-600 md:text-base">
            진행 예정인 프로젝트와 진행 중인 프로젝트들을 한 곳에서 정리합니다.
          </p>
        </header>

        {/* 카드 리스트 */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <article
              key={project.id}
              className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white/80 p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              {/* 상태 배지 */}
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(
                    project.status
                  )}`}
                >
                  {getStatusLabel(project.status)}
                </span>
                {/* 태그 갯수 간단 표시 */}
                <span className="text-xs text-slate-400">
                  {project.tags.length} tags
                </span>
              </div>

              {/* 제목 */}
              <h2 className="text-lg font-semibold md:text-xl">
                {project.title}
              </h2>
              {project.subtitle && (
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  {project.subtitle}
                </p>
              )}

              {/* 설명 */}
              <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-700 md:text-base">
                {project.description}
              </p>

              {/* 태그 */}
              <div className="mt-4 flex flex-wrap gap-2">
                {project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* 링크 영역 */}
              {project.link && (
                <div className="mt-4">
                  <a
                    href={project.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm font-medium text-sky-600 hover:text-sky-700"
                  >
                    자세히 보기
                    <span className="ml-1 text-xs">↗</span>
                  </a>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
