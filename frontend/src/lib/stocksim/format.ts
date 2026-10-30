/**
 * 모의투자 화면의 숫자 표기.
 *
 * 국내 증권 앱 관례대로 상승은 빨강, 하락은 파랑이다 (`changeTone`).
 */

const won = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

/** 70000 → "70,000원" */
export function formatWon(value: number): string {
  return `${won.format(Math.round(value))}원`;
}

/** 부호를 붙인다. 0 은 부호 없이. 12000 → "+12,000원" */
export function formatSignedWon(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return formatWon(0);
  return `${rounded > 0 ? "+" : "-"}${formatWon(Math.abs(rounded))}`;
}

/** 0.0123 → "+1.23%" */
export function formatRate(rate: number): string {
  const percent = rate * 100;
  if (Math.abs(percent) < 0.005) return "0.00%";
  return `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
}

export type ChangeTone = "up" | "down" | "flat";

export function changeTone(value: number | null | undefined): ChangeTone {
  if (value == null || Math.round(value * 100) === 0) return "flat";
  return value > 0 ? "up" : "down";
}

/** 디자인 토큰만 쓴다 (원색 금지). */
export const TONE_TEXT: Record<ChangeTone, string> = {
  up: "text-danger-soft-fg",
  down: "text-info-soft-fg",
  flat: "text-fg-muted",
};

/** 예수금으로 살 수 있는 최대 수량 */
export function maxBuyable(cash: number, price: number | null | undefined): number {
  if (!price || price <= 0) return 0;
  return Math.floor(cash / price);
}

/** ISO 시각 → "10/30 14:05" (로컬 시간) */
export function formatShortTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}
