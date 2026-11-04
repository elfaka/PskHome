/** 항공권 화면 표시용 순수 함수 */

const KST_OFFSET_MS = 9 * 60 * 60_000;

/** KST 기준 오늘 + days 일 (YYYY-MM-DD) */
export function kstDatePlus(days: number, now = Date.now()): string {
  return new Date(now + KST_OFFSET_MS + days * 86_400_000).toISOString().slice(0, 10);
}

export function formatPrice(price: number | null): string {
  return price == null ? "가격 정보 없음" : `${price.toLocaleString("ko-KR")}원`;
}

/** 140 → "2시간 20분" */
export function formatDuration(minutes: number | null): string {
  if (minutes == null) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** "2026-12-01 09:05" → "09:05" */
export function clockOf(localTime: string): string {
  return localTime.split(" ")[1] ?? localTime;
}

/** 도착이 출발보다 며칠 뒤인지 (현지 날짜 기준). 같은 날이면 0 */
export function dayOffset(departure: string, arrival: string): number {
  const d = Date.parse(`${departure.slice(0, 10)}T00:00:00Z`);
  const a = Date.parse(`${arrival.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(a)) return 0;
  return Math.round((a - d) / 86_400_000);
}

/** "2026-12-01" → "12월 1일 (화)" */
export function formatDateLabel(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${weekday})`;
}

const PRICE_LEVEL: Record<string, string> = {
  low: "평소보다 저렴",
  typical: "평소 수준",
  high: "평소보다 비쌈",
};

export function priceLevelLabel(level: string | null): string | null {
  if (!level) return null;
  return PRICE_LEVEL[level.toLowerCase()] ?? level;
}
