/**
 * 청첩장 콘텐츠 — 화면은 이 파일만 읽는다. 실제 내용이 정해지면 여기만 바꾼다.
 * 옵셔널 필드가 비어 있으면 해당 요소는 렌더되지 않는다.
 * (지금 값은 전부 플레이스홀더다. 예식일만 실제 값)
 */

export type Photo = {
  /** `/public` 기준 경로 (예: "/wedding/story-1.jpg") */
  src: string;
  alt: string;
};

export type Parents = {
  father?: string;
  mother?: string;
};

export type Person = {
  name: string;
  /** 스크립트체로 겹쳐 쓰는 영문 이름 */
  nameEn: string;
  /** "아들", "장남", "딸", "차녀" 등 */
  relation: string;
  parents?: Parents;
};

export type StoryItem = {
  date: string;
  title: string;
  body: string;
  photo?: Photo;
};

export type TransportGuide = {
  label: string;
  lines: string[];
};

export type MapLinks = {
  naver?: string;
  kakao?: string;
  tmap?: string;
};

export type WeddingData = {
  groom: Person;
  bride: Person;
  /** 영문 이니셜 모노그램 (봉투 실링, 클로징) */
  monogram: string;
  ceremony: {
    /** KST 기준 날짜 YYYY-MM-DD */
    date: string;
    /** KST 기준 HH:mm. 미정이면 비워 둔다 → 날짜만 표시, 카운트다운은 00:00 기준 */
    time?: string;
  };
  venue: {
    name: string;
    hall?: string;
    address?: string;
    tel?: string;
    transport?: TransportGuide[];
    maps?: MapLinks;
  };
  greeting: string[];
  /** 첫 화면 카드 뒤 폴라로이드 두 장. 비어 있으면 사진 자리 플레이스홀더 */
  scenePhotos?: Photo[];
  story: StoryItem[];
  closing: string;
};

export const wedding: WeddingData = {
  groom: {
    name: "박선규",
    nameEn: "Sunkyu",
    relation: "아들",
    parents: { father: "홍판서", mother: "춘섬" },
  },
  bride: {
    name: "곽영미",
    nameEn: "Youngmi",
    relation: "딸",
    parents: { father: "성참판", mother: "월매" },
  },
  monogram: "G&C",
  ceremony: {
    date: "2027-05-15",
  },
  venue: {
    name: "루이비스 컨벤션 강서",
    hall: "8층 세인트그레이스홀",
    address: "서울 강서구 양천로 476 8층",
    transport: [
      { label: "지하철", lines: ["0호선 00역 0번 출구 도보 5분"] },
      { label: "버스", lines: ["간선 000 · 지선 0000", "00정류장 하차"] },
      { label: "주차", lines: ["건물 지하 주차장 2시간 무료"] },
    ],
    maps: {},
  },
  greeting: [
    "서로 다른 길을 걸어온 두 사람이",
    "이제 같은 길을 함께 걸어가려 합니다.",
    "",
    "저희의 새로운 시작을",
    "따뜻한 마음으로 축복해 주시면 감사하겠습니다.",
  ],
  story: [
    {
      date: "2019. 04",
      title: "처음 만난 날",
      body: "봄비가 내리던 날, 우연히 같은 우산 아래에서 처음 인사를 나눴어요.",
    },
    {
      date: "2022. 10",
      title: "함께한 계절들",
      body: "사계절을 여러 번 함께 보내며 서로의 가장 편한 사람이 되었어요.",
    },
    {
      date: "2026. 12",
      title: "약속",
      body: "앞으로의 모든 계절도 함께하자고, 조용히 약속했어요.",
    },
  ],
  closing: "소중한 걸음으로 함께해 주셔서 감사합니다.",
};
