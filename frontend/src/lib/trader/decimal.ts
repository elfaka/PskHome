/**
 * 자동매매 대시보드 숫자 표시 — 백엔드가 주는 Decimal 문자열을 **문자열 그대로** 포맷한다.
 * (금액을 float 으로 바꾸지 않는다. 화면 표시용 계산도 하지 않는다)
 */

const DEC = /^([+-])?(\d+)(?:\.(\d+))?$/;

export type Sign = "up" | "down" | "flat";

export function signOf(value: string | null | undefined): Sign {
  const m = value == null ? null : DEC.exec(value.trim());
  if (!m) return "flat";
  const isZero = /^0*$/.test(m[2]) && /^0*$/.test(m[3] ?? "");
  if (isZero) return "flat";
  return m[1] === "-" ? "down" : "up";
}

function group(int: string): string {
  return int.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * "1234567.8900" → "1,234,567" (digits=0), "1,234,567.89" (digits=2). 버림이 아니라 반올림한다.
 * signed=true 면 양수에 "+" 를 붙인다.
 */
export function formatDec(value: string | null | undefined, digits = 0, signed = false): string {
  if (value == null) return "—";
  const m = DEC.exec(value.trim());
  if (!m) return value;
  const neg = m[1] === "-";
  let int = m[2];
  let frac = (m[3] ?? "").padEnd(digits + 1, "0");
  // 반올림: digits 자리 다음 숫자가 5 이상이면 올린다 (문자열 덧셈)
  const roundUp = Number(frac[digits]) >= 5;
  frac = frac.slice(0, digits);
  if (roundUp) {
    const digitsStr = (int + frac).split("").map(Number);
    let i = digitsStr.length - 1;
    while (i >= 0) {
      if (digitsStr[i] === 9) {
        digitsStr[i] = 0;
        i--;
      } else {
        digitsStr[i] += 1;
        break;
      }
    }
    const joined = (i < 0 ? "1" : "") + digitsStr.join("");
    int = joined.slice(0, joined.length - digits) || "0";
    frac = digits ? joined.slice(joined.length - digits) : "";
  }
  const body = group(int) + (digits ? `.${frac}` : "");
  const zero = /^[0,.]*$/.test(body);
  const sign = zero ? "" : neg ? "-" : signed ? "+" : "";
  return sign + body;
}

/** 비율 문자열("0.012345") → 퍼센트 문자열("+1.23%"). 소수점을 두 자리 옮기는 것도 문자열로 한다. */
export function formatRatioPct(value: string | null | undefined, digits = 2, signed = true): string {
  if (value == null) return "—";
  const m = DEC.exec(value.trim());
  if (!m) return value;
  const frac = (m[3] ?? "").padEnd(2, "0");
  const shifted = `${m[1] ?? ""}${m[2]}${frac.slice(0, 2)}.${frac.slice(2) || "0"}`;
  return `${formatDec(shifted, digits, signed)}%`;
}

const KST = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** UTC ISO → "11. 26. 09:30:00" (KST) */
export function formatKst(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : KST.format(d);
}

/**
 * Decimal 문자열 비교 (a < b → -1, 같으면 0, a > b → 1). 형식이 아니면 null.
 * 지표 구간(RSI 70 이상 등)을 나눌 때 쓴다 — number 로 바꾸지 않는다.
 */
export function cmpDec(a: string | null | undefined, b: string): -1 | 0 | 1 | null {
  const ma = a == null ? null : DEC.exec(a.trim());
  const mb = DEC.exec(b.trim());
  if (!ma || !mb) return null;
  const norm = (m: RegExpExecArray) => {
    const int = m[2].replace(/^0+(?=\d)/, "");
    const frac = (m[3] ?? "").replace(/0+$/, "");
    const zero = /^0*$/.test(int) && frac === "";
    return { neg: m[1] === "-" && !zero, int, frac };
  };
  const x = norm(ma);
  const y = norm(mb);
  if (x.neg !== y.neg) return x.neg ? -1 : 1;
  const flip = x.neg ? -1 : 1;
  if (x.int.length !== y.int.length) return (x.int.length < y.int.length ? -1 : 1) * flip as -1 | 1;
  const len = Math.max(x.frac.length, y.frac.length);
  const xs = x.int + x.frac.padEnd(len, "0");
  const ys = y.int + y.frac.padEnd(len, "0");
  if (xs === ys) return 0;
  return (xs < ys ? -1 : 1) * flip as -1 | 1;
}
