/** ISO 시각의 한국 날짜 ("2026-10-30"). 일봉 날짜 비교는 거래소 기준인 KST 로 한다. */
export function kstDate(iso: string | number | Date): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}
