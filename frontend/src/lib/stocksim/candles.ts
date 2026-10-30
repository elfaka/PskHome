import type { CandlePoint } from "@/api/stockSim";

/** ISO 시각의 한국 날짜 ("2026-10-30"). 일봉 날짜 비교는 거래소 기준인 KST 로 한다. */
export function kstDate(iso: string | number | Date): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

/**
 * 전일 종가 — 현재가가 찍힌 날보다 앞선 마지막 일봉의 종가.
 *
 * 장 마감 뒤나 주말에는 현재가가 마지막 거래일 종가라서,
 * "오늘 날짜보다 앞선 봉"이 아니라 "현재가 날짜보다 앞선 봉"을 기준으로 잡아야
 * 주말에도 금요일 등락률이 0% 로 바뀌지 않는다.
 *
 * @param candles 오래된 것부터 정렬된 일봉
 */
export function previousClose(
  candles: CandlePoint[],
  quoteTime: string | null,
  now: Date = new Date()
): number | null {
  const today = kstDate(quoteTime ?? now);

  for (let i = candles.length - 1; i >= 0; i--) {
    if (kstDate(candles[i].time) < today) return candles[i].close;
  }

  return null;
}
