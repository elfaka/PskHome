/**
 * 프로필 정보 — GitHub 프로필 README 를 옮겨 온 것.
 *
 * `/about` 과 `/career` 가 같은 사실을 각자 들고 있으면 한쪽만 갱신되므로
 * 여기 한곳에 모은다. 문구를 고칠 일이 생기면 이 파일만 보면 된다.
 */

/** 사이트 전반에서 쓰는 한 줄 문구. */
export const TAGLINE = "Always learning, always building.";

/** 자기소개 문단. 한 원소가 한 단락이다. */
export const INTRO: string[] = [
  "프론트엔드부터 백엔드, 배포와 운영까지 직접 만지는 개발자입니다. 화면 하나가 사용자에게 닿기까지 거치는 모든 층을 이해하고 싶어서 풀스택으로 범위를 넓혀 왔습니다.",
  "확장 가능한 백엔드 아키텍처와 군더더기 없는 프론트엔드 UX에 관심이 많습니다. 구조를 먼저 잡아두면 기능을 붙일 때 덜 흔들린다고 믿는 편입니다.",
  "엉켜 있는 인프라를 정리해서 “그냥 잘 돌아가는” 상태로 만들어 두는 일을 특히 좋아합니다.",
  "기본기는 알고리즘 문제로 다듬습니다. 백준에서 푼 문제와 풀이는 이 사이트의 PS 기록에 남겨 두고 있습니다.",
];

/** 요약 스트립 — 소속/학력/관심을 한눈에. */
export const SUMMARY: { label: string; value: string; sub?: string }[] = [
  { label: "소속", value: "ConsumerInsight", sub: "2023.05 — 현재" },
  { label: "학력", value: "Kwangwon University", sub: "2017.03 — 2023.08" },
  { label: "관심", value: "Full Stack", sub: "Backend · Frontend · DevOps" },
];

/** 기술 스택. group 은 분류명. */
export const SKILLS: { group: string; items: string[] }[] = [
  { group: "Frontend", items: ["React", "Next.js"] },
  { group: "Backend", items: ["Node.js", "Nest.js"] },
  { group: "Database", items: ["MSSQL", "MySQL", "MongoDB"] },
  {
    group: "DevOps / Infra",
    items: ["Docker", "Ubuntu", "Nginx", "GitHub Actions"],
  },
];

/** 관심을 두고 파고 있는 주제. */
export const FOCUS: string[] = [
  "확장 가능한 백엔드 아키텍처",
  "군더더기 없는 프론트엔드 UX",
  "손이 덜 가는 배포·운영 파이프라인",
  "알고리즘 문제 풀이 (백준)",
];

/** 연락처·외부 링크. */
export const LINKS: { label: string; href: string; hint?: string }[] = [
  { label: "Email", href: "mailto:chopr159@gmail.com", hint: "chopr159@gmail.com" },
  { label: "GitHub", href: "https://github.com/elfaka", hint: "@elfaka" },
];

export type CareerEntry = {
  /** 예: "2023.05 — 현재" */
  period: string;
  /** 회사 / 기관 / 활동명 */
  org: string;
  /** 직무 또는 역할 */
  role: string;
  description?: string;
  /**
   * 한 줄씩 나열되는 주요 업무·성과.
   *
   * TODO: 실제로 맡은 일과 성과를 적을 자리다.
   *       프로필 README 에 없던 내용이라 비워 두었다 —
   *       채우면 아래 타임라인에 자동으로 붙는다.
   */
  highlights?: string[];
  tags?: string[];
  /** 재직 중이면 true */
  current?: boolean;
};

/** 경력. 최신순. */
export const CAREER: CareerEntry[] = [
  {
    period: "2023.05 — 현재",
    org: "ConsumerInsight",
    // TODO: 실제 직무명이 다르면 여기를 고친다.
    //       프로필의 "Frontend + Backend + DevOps Engineer" 를 옮겨 적은 값이다.
    role: "Full Stack Engineer",
    description:
      "프론트엔드와 백엔드를 함께 맡고, 배포와 서버 운영까지 이어서 담당하고 있습니다.",
    current: true,
  },
];

/** 학력. 최신순. */
export const EDUCATION: { period: string; org: string; note?: string }[] = [
  {
    period: "2017.03 — 2023.08",
    org: "Kwangwon University",
    note: "졸업",
  },
];
