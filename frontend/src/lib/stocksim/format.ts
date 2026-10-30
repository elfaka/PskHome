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

/** 잔량 막대·점수 막대 배경 */
export const TONE_BG: Record<ChangeTone, string> = {
  up: "bg-danger",
  down: "bg-info",
  flat: "bg-fg-subtle",
};

/** 70000 → "70,000" (호가·체결처럼 단위 없이 촘촘히 보여줄 때) */
export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * 큰 금액을 조·억 단위로 줄인다. 증권사 화면의 시가총액·매출액 표기와 같다.
 * 1_297_873_850_976_000 → "1,297조 8,739억"
 */
export function formatKrwCompact(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const JO = 1e12;
  const EOK = 1e8;

  if (abs >= JO) {
    const jo = Math.floor(abs / JO);
    const eok = Math.floor((abs % JO) / EOK);
    return `${sign}${formatNumber(jo)}조${eok > 0 ? ` ${formatNumber(eok)}억` : ""}`;
  }
  if (abs >= EOK) return `${sign}${formatNumber(Math.floor(abs / EOK))}억`;
  if (abs >= 1e4) return `${sign}${formatNumber(Math.floor(abs / 1e4))}만`;
  return `${sign}${formatNumber(abs)}`;
}

/** 거래량·순매수 수량. 29_363_972 → "2,936만" */
export function formatShares(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e8) return `${sign}${formatNumber(abs / 1e8, 2)}억`;
  if (abs >= 1e4) return `${sign}${formatNumber(Math.round(abs / 1e4))}만`;
  return `${sign}${formatNumber(abs)}`;
}

/** 0.1036 → "10.36%" (부호 없음) */
export function formatPercent(rate: number, digits = 2): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

/** ISO 시각 → KST "14:05:09" */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

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
