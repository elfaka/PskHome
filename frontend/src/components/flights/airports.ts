/**
 * 공항 드롭다운 목록.
 *
 * `AIRPORTS` 는 **한국인 여행객 기준 인기 순**으로 적는다 (배열 순서가 곧 드롭다운 순서다).
 * 2025년 대한항공 국제선 탑승객 방문 도시(도쿄 · 오사카 · 후쿠오카 · 방콕 순), 아고다 한국인 인기 여행지
 * (도쿄 · 후쿠오카 · 오사카, 일본·베트남 강세), 여행 플랫폼 발표(제주 · 오사카)를 묶어 대략 정한 순서다.
 * 공식 통계 순위는 아니므로 새 자료가 나오면 순서만 바꾸면 된다.
 *
 * 목록에 없는 공항도 IATA 코드 3자리를 직접 입력하면 검색된다.
 */
export type Airport = { code: string; name: string; city: string; country: string };

export const AIRPORTS: Airport[] = [
  { code: "NRT", name: "나리타국제공항", city: "도쿄", country: "일본" },
  { code: "HND", name: "하네다공항", city: "도쿄", country: "일본" },
  { code: "KIX", name: "간사이국제공항", city: "오사카", country: "일본" },
  { code: "FUK", name: "후쿠오카공항", city: "후쿠오카", country: "일본" },
  { code: "CJU", name: "제주국제공항", city: "제주", country: "대한민국" },
  { code: "BKK", name: "수완나품국제공항", city: "방콕", country: "태국" },
  { code: "DAD", name: "다낭국제공항", city: "다낭", country: "베트남" },
  { code: "OKA", name: "나하공항", city: "오키나와", country: "일본" },
  { code: "CTS", name: "신치토세공항", city: "삿포로", country: "일본" },
  { code: "TPE", name: "타오위안국제공항", city: "타이베이", country: "대만" },
  { code: "CXR", name: "깜라인국제공항", city: "나트랑", country: "베트남" },
  { code: "PQC", name: "푸꾸옥국제공항", city: "푸꾸옥", country: "베트남" },
  { code: "CEB", name: "막탄세부국제공항", city: "세부", country: "필리핀" },
  { code: "GUM", name: "괌국제공항", city: "괌", country: "미국" },
  { code: "HKG", name: "홍콩국제공항", city: "홍콩", country: "홍콩" },
  { code: "PVG", name: "상하이 푸둥국제공항", city: "상하이", country: "중국" },
  { code: "SIN", name: "창이공항", city: "싱가포르", country: "싱가포르" },
  { code: "HAN", name: "노이바이국제공항", city: "하노이", country: "베트남" },
  { code: "SGN", name: "떤선녓국제공항", city: "호찌민", country: "베트남" },
  { code: "NGO", name: "주부국제공항", city: "나고야", country: "일본" },
  { code: "MNL", name: "니노이 아키노국제공항", city: "마닐라", country: "필리핀" },
  { code: "DPS", name: "응우라라이국제공항", city: "발리", country: "인도네시아" },
  { code: "SPN", name: "사이판국제공항", city: "사이판", country: "북마리아나 제도" },
  { code: "HKT", name: "푸껫국제공항", city: "푸껫", country: "태국" },
  { code: "KUL", name: "쿠알라룸푸르국제공항", city: "쿠알라룸푸르", country: "말레이시아" },
  { code: "MFM", name: "마카오국제공항", city: "마카오", country: "마카오" },
  { code: "PEK", name: "베이징 서우두국제공항", city: "베이징", country: "중국" },
  { code: "HNL", name: "대니얼 K. 이노우에국제공항", city: "호놀룰루", country: "미국" },
  { code: "FCO", name: "피우미치노공항", city: "로마", country: "이탈리아" },
  { code: "CDG", name: "샤를 드골공항", city: "파리", country: "프랑스" },
  { code: "LAX", name: "로스앤젤레스국제공항", city: "로스앤젤레스", country: "미국" },
  { code: "LHR", name: "히드로공항", city: "런던", country: "영국" },
  { code: "BCN", name: "엘프라트공항", city: "바르셀로나", country: "스페인" },
  { code: "IST", name: "이스탄불공항", city: "이스탄불", country: "튀르키예" },
  { code: "FRA", name: "프랑크푸르트공항", city: "프랑크푸르트", country: "독일" },
  { code: "JFK", name: "존 F. 케네디국제공항", city: "뉴욕", country: "미국" },
  { code: "SFO", name: "샌프란시스코국제공항", city: "샌프란시스코", country: "미국" },
  { code: "SYD", name: "시드니공항", city: "시드니", country: "호주" },
  { code: "SEA", name: "시애틀 타코마국제공항", city: "시애틀", country: "미국" },
  { code: "YVR", name: "밴쿠버국제공항", city: "밴쿠버", country: "캐나다" },
  // 국내 출발 공항 (도착지로는 인기가 낮아 뒤에 둔다. 출발지 목록에서는 맨 앞으로 올린다)
  { code: "ICN", name: "인천국제공항", city: "서울", country: "대한민국" },
  { code: "GMP", name: "김포국제공항", city: "서울", country: "대한민국" },
  { code: "PUS", name: "김해국제공항", city: "부산", country: "대한민국" },
  { code: "TAE", name: "대구국제공항", city: "대구", country: "대한민국" },
  { code: "CJJ", name: "청주국제공항", city: "청주", country: "대한민국" },
  { code: "MWX", name: "무안국제공항", city: "무안", country: "대한민국" },
];

/** 출발지 목록 맨 앞에 둘 국내 공항 (이용객 많은 순) */
const ORIGIN_FIRST = ["ICN", "GMP", "PUS", "CJU", "TAE", "CJJ", "MWX"];

/** 출발지 드롭다운 — 국내 공항(이용객 순) 다음에 나머지를 인기 순으로 */
export const ORIGIN_AIRPORTS: Airport[] = [
  ...ORIGIN_FIRST.map((code) => AIRPORTS.find((a) => a.code === code)!),
  ...AIRPORTS.filter((a) => !ORIGIN_FIRST.includes(a.code)),
];

/** 도착지 드롭다운 — 인기 순 그대로 */
export const DESTINATION_AIRPORTS: Airport[] = AIRPORTS;

export function findAirport(code: string): Airport | undefined {
  return AIRPORTS.find((a) => a.code === code);
}

/** 검색어로 거른다 (코드·도시·공항 이름·나라). 순서는 목록 순서 그대로 둔다 */
export function filterAirports(list: Airport[], query: string): Airport[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (a) =>
      a.code.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.country.toLowerCase().includes(q)
  );
}

/**
 * 입력값 → IATA 코드.
 * - "ICN", "icn" → "ICN"
 * - "인천국제공항 (ICN)" 처럼 목록 항목 이름 → 괄호 안 코드
 * - "도쿄" 처럼 도시·공항 이름 → 목록에서 처음 맞는 공항 (인기 순이라 가장 많이 가는 공항)
 */
export function toAirportCode(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const inParens = value.match(/\(([A-Za-z]{3})\)\s*$/);
  if (inParens) return inParens[1].toUpperCase();
  if (/^[A-Za-z]{3}$/.test(value)) return value.toUpperCase();

  const match = AIRPORTS.find((a) => a.city === value || a.name === value);
  return match?.code ?? null;
}

/** 선택된 공항 표시용 — "도쿄 나리타국제공항 (NRT)". 목록에 없는 코드는 코드만 */
export function airportLabel(code: string): string {
  const a = findAirport(code);
  return a ? `${a.city} ${a.name} (${a.code})` : code;
}
