import { useMemo, useState } from "react";

type Opt = {
  label: string;
  count: number;
  rate: number;
  // 백엔드가 나중에 score/value를 줄 수도 있으니 받아줌(있으면 우선 사용)
  score?: number | string;
  value?: number | string;
};

// "1점", "10 (매우그렇다)" 같은 라벨에서 첫 숫자(정수/소수) 추출
function extractNumeric(label: string): number | null {
  const m = String(label).match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function getScore(o: Opt): number | null {
  // 우선순위: score/value 필드가 있으면 그걸 사용
  const s1 = o.score ?? o.value;
  if (s1 !== undefined && s1 !== null && String(s1).trim() !== "") {
    const n = Number(String(s1).trim());
    if (Number.isFinite(n)) return n;
  }
  return extractNumeric(o.label);
}

function isIntegerClose(n: number) {
  return Math.abs(n - Math.round(n)) < 1e-9;
}

export default function ScaleRenderer({
  options,
  initialShow = 12,
}: {
  options: Opt[];
  initialShow?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const normalized = useMemo(() => {
    const arr = [...(options ?? [])];

    // 점수 추출 성공한 항목들
    const scored = arr
      .map((o) => ({ ...o, _score: getScore(o) }))
      .filter((o) => o._score !== null) as (Opt & { _score: number })[];

    // 점수 못 뽑은 항목들
    const unscored = arr.filter((o) => getScore(o as Opt) === null);

    // 점수 기준 오름차순 정렬
    scored.sort((a, b) => a._score - b._score);

    // ✅ 연속 척도(1~10 같은 정수 범위)라면 누락값 채우기
    // 조건:
    // - scored가 3개 이상
    // - 최소/최대가 정수에 가깝고
    // - 범위가 2~50 정도(너무 크면 자동 생성 안 함)
    let filled: Opt[] = scored.map(({ _score, ...rest }) => rest);
    if (scored.length >= 3) {
      const min = scored[0]._score;
      const max = scored[scored.length - 1]._score;
      if (
        isIntegerClose(min) &&
        isIntegerClose(max) &&
        max - min >= 2 &&
        max - min <= 50
      ) {
        const minI = Math.round(min);
        const maxI = Math.round(max);
        const map = new Map<number, Opt & { _score: number }>();
        for (const s of scored) map.set(s._score, s);

        const result: Opt[] = [];
        for (let x = minI; x <= maxI; x++) {
          const hit = map.get(x);
          if (hit) {
            const { _score, ...rest } = hit;
            result.push(rest);
          } else {
            // 누락 점수는 0으로 생성
            result.push({
              label: String(x),
              count: 0,
              rate: 0,
              score: x,
            });
          }
        }
        filled = result;
      }
    }

    // 점수 추출 실패 항목들은 맨 뒤에 라벨로 정렬해 붙임
    if (unscored.length) {
      unscored.sort((a, b) => String(a.label).localeCompare(String(b.label), "ko"));
      filled = [...filled, ...unscored];
    }

    return filled;
  }, [options]);

  const visible = expanded ? normalized : normalized.slice(0, initialShow);
  const hasMore = normalized.length > initialShow;

  // 평균/표준편차(정수/숫자 척도에서만 의미 있음)
  const stats = useMemo(() => {
    let total = 0;
    let sum = 0;
    let sumSq = 0;

    for (const o of normalized) {
      const x = getScore(o);
      if (x === null) continue;
      const c = Number(o.count) || 0;
      total += c;
      sum += x * c;
      sumSq += x * x * c;
    }
    if (total <= 0) return null;

    const mean = sum / total;
    const variance = sumSq / total - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));

    return { n: total, mean, std };
  }, [normalized]);

  if (!normalized.length) {
    return <div className="text-sm text-zinc-500">집계 결과 없음</div>;
  }

  return (
    <div className="space-y-3">
      {stats && (
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
          <span className="font-semibold text-zinc-900">척도 통계</span>
          <span className="mx-2 text-zinc-300">|</span>
          <span>n={stats.n}</span>
          <span className="mx-2 text-zinc-300">|</span>
          <span>평균 {stats.mean.toFixed(2)}</span>
          <span className="mx-2 text-zinc-300">|</span>
          <span>표준편차 {stats.std.toFixed(2)}</span>
        </div>
      )}

      {/* ✅ CHOICE처럼 옵션 카드형 */}
      <ul className="space-y-2">
        {visible.map((o) => (
          <li key={o.label} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-zinc-900">{o.label}</div>
                <div className="mt-1 h-2 w-full rounded-full bg-white">
                  <div
                    className="h-2 rounded-full bg-zinc-900"
                    style={{ width: `${Math.min(100, Math.max(0, o.rate))}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-zinc-600">
                <div className="font-semibold text-zinc-900">{o.rate}%</div>
                <div>{o.count}명</div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          {expanded ? "접기" : `더보기 (${normalized.length - initialShow}개)`}
        </button>
      )}
    </div>
  );
}
