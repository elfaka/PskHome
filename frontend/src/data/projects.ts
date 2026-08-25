import type { BadgeTone } from "@/components/ui/Badge";

/**
 * 토이 프로젝트 목록.
 *
 * `/project` 화면과 헤더의 Project 드롭다운이 같은 목록을 봐야 하므로
 * 화면 파일에서 꺼내 여기로 옮겼다. 한쪽만 갱신되는 일을 막으려는 의도다.
 *
 * 스택 표기는 실제 구현 스택을 따른다.
 * 이 저장소는 Express(백엔드) + Next.js(프론트엔드) 다 —
 * 예전 목록의 "Spring Boot", "React" 는 프레임워크 이관 전의 잔재였다.
 */
export type ProjectStatus = "planning" | "in-progress" | "done";

export type ProjectInfo = {
  id: number;
  title: string;
  subtitle?: string;
  description: string;
  status: ProjectStatus;
  tags: string[];
  /** 이 사이트 안의 경로면 internal, 외부 주소면 external */
  link?: { href: string; internal?: boolean };
};

export const PROJECTS: ProjectInfo[] = [
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

/**
 * 상태 → 라벨/배지 tone.
 *
 * `/project` 카드와 헤더 드롭다운이 같은 배지를 쓰므로 목록과 같이 둔다.
 * (라우트 page 파일에서는 default/metadata 외의 export 를 두지 않는다)
 */
export const PROJECT_STATUS: Record<
  ProjectStatus,
  { label: string; tone: BadgeTone }
> = {
  planning: { label: "기획 중", tone: "warning" },
  "in-progress": { label: "진행 중", tone: "info" },
  done: { label: "완료", tone: "success" },
};

/** `/project` 화면의 카드 앵커 id. 헤더 드롭다운이 이 id 로 딥링크한다. */
export function projectAnchorId(id: number) {
  return `project-${id}`;
}
