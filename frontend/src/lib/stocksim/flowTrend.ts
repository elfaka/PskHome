/**
 * 순매수 흐름이 계속 늘고 있는지, 어느 시점부터 꺾였는지 판단한다.
 * 값은 오래된 것부터 (누적 순매수 같은 수준값).
 */

export type FlowTurn =
  /** 마지막 값이 기간 최고 — 계속 늘고 있다. `change` 는 최저점 대비 */
  | { kind: "high"; index: number; change: number }
  /** 마지막 값이 기간 최저 — 계속 줄고 있다. `change` 는 최고점 대비 (음수) */
  | { kind: "low"; index: number; change: number }
  /** 최고점을 찍고 내려왔다. `index` 는 최고점, `change` 는 최고점 대비 (음수) */
  | { kind: "belowPeak"; index: number; change: number };

/** 오래된 날부터 더해 간 누적값 */
export function cumulative(values: number[]): number[] {
  let sum = 0;
  return values.map((v) => (sum += v));
}

/** 값이 2개 미만이거나 전부 같으면 null */
export function flowTurn(values: number[]): FlowTurn | null {
  if (values.length < 2) return null;

  const lastIndex = values.length - 1;
  const last = values[lastIndex];
  let peak = 0;
  let trough = 0;
  // 같은 값이면 더 최근 것을 고점·저점으로 본다
  values.forEach((v, i) => {
    if (v >= values[peak]) peak = i;
    if (v <= values[trough]) trough = i;
  });

  if (values[peak] === values[trough]) return null;
  if (peak === lastIndex) return { kind: "high", index: trough, change: last - values[trough] };
  if (trough === lastIndex) return { kind: "low", index: peak, change: last - values[peak] };
  return { kind: "belowPeak", index: peak, change: last - values[peak] };
}

export type FlowConsensus = "bothBuy" | "bothSell" | "mixed";

/** 외국인·기관이 같은 방향인지 — 둘 다 순매수면 쌍끌이 매수, 둘 다 순매도면 쌍끌이 매도 */
export function flowConsensus(foreigner: number, institution: number): FlowConsensus {
  if (foreigner > 0 && institution > 0) return "bothBuy";
  if (foreigner < 0 && institution < 0) return "bothSell";
  return "mixed";
}

/** 마지막 두 기록 비교. 기록이 2개 미만이면 null */
export function recentDirection(values: number[]): "up" | "down" | "flat" | null {
  if (values.length < 2) return null;
  const diff = values[values.length - 1] - values[values.length - 2];
  return diff > 0 ? "up" : diff < 0 ? "down" : "flat";
}
