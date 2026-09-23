/**
 * 예식 날짜 계산. Intl/로컬 시간대를 쓰지 않는다 —
 * 서버(Node)와 브라우저, 해외 접속 기기에서 모두 같은 결과가 나와야 하이드레이션이 어긋나지 않는다.
 */

export const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
export const WEEKDAYS_EN = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

export type CeremonyDate = {
  year: number;
  month: number;
  day: number;
  /** 0 = 일요일 */
  weekday: number;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** 데이터 입력 실수는 조용히 넘기지 않고 빌드(프리렌더)에서 터뜨린다. */
export function parseCeremonyDate(date: string): CeremonyDate {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`예식 날짜 형식이 잘못됐습니다 (YYYY-MM-DD): ${date}`);

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));

  // Date 는 2027-02-30 을 3월 2일로 넘겨버리므로 되돌려 비교한다
  if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    throw new Error(`존재하지 않는 예식 날짜입니다: ${date}`);
  }

  return { year, month, day, weekday: utc.getUTCDay() };
}

/** KST 예식 시각의 epoch ms. 시각이 미정이면 KST 00:00. */
export function ceremonyInstant(date: string, time?: string): number {
  parseCeremonyDate(date);
  if (time !== undefined && !TIME_RE.test(time)) {
    throw new Error(`예식 시각 형식이 잘못됐습니다 (HH:mm): ${time}`);
  }
  return Date.parse(`${date}T${time ?? "00:00"}:00+09:00`);
}

/** "오후 1시 30분" — 정각이면 분을 생략한다. */
export function formatTimeKo(time: string): string {
  const m = TIME_RE.exec(time);
  if (!m) throw new Error(`예식 시각 형식이 잘못됐습니다 (HH:mm): ${time}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  const period = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${h12}시${min ? ` ${min}분` : ""}`;
}

/** 일요일 시작 주 단위 달력. 빈 칸은 null. */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
