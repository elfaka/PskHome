import { useMemo, useState } from "react";

type AllOpt = { label: string; order?: number | null; value?: string | null; score?: number | null };
type StatOpt = { label: string; count: number; rate: number };

function extractNumeric(label: string): number | null {
  const m = String(label).match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function mergeAllOptions(allOptions: AllOpt[] | undefined, stats: StatOpt[] | undefined) {
  const all = allOptions ?? [];
  const map = new Map((stats ?? []).map((s) => [s.label, s]));

  const merged = all.map((o) => {
    const hit = map.get(o.label);
    return {
      label: o.label,
      order: o.order ?? null,
      score: o.score ?? extractNumeric(o.label),
      count: hit?.count ?? 0,
      rate: hit?.rate ?? 0,
    };
  });

  if (!merged.length && (stats ?? []).length) {
    return (stats ?? []).map((s) => ({
      label: s.label,
      order: null,
      score: extractNumeric(s.label),
      count: s.count,
      rate: s.rate,
    }));
  }

  merged.sort((a, b) => {
    const ao = a.order ?? 999999;
    const bo = b.order ?? 999999;
    if (ao !== bo) return ao - bo;

    const as = a.score;
    const bs = b.score;
    if (as !== null && bs !== null && as !== bs) return as - bs;

    return String(a.label).localeCompare(String(b.label), "ko");
  });

  return merged;
}

export default function ScaleRenderer({
  allOptions,
  options,
  initialShow = 12,
}: {
  allOptions?: AllOpt[];
  options: StatOpt[];
  initialShow?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const merged = useMemo(() => mergeAllOptions(allOptions, options), [allOptions, options]);
  const visible = expanded ? merged : merged.slice(0, initialShow);
  const hasMore = merged.length > initialShow;

  const stats = useMemo(() => {
    let total = 0;
    let sum = 0;
    let sumSq = 0;

    for (const o of merged) {
      if (o.score === null) continue;
      const c = Number(o.count) || 0;
      total += c;
      sum += o.score * c;
      sumSq += o.score * o.score * c;
    }
    if (total <= 0) return null;

    const mean = sum / total;
    const variance = sumSq / total - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));
    return { n: total, mean, std };
  }, [merged]);

  if (!merged.length) return <div className="text-sm text-zinc-500">집계 결과 없음</div>;

  return (
    <div className="space-y-3">
      {stats && (
        <div className="rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm">
          <span className="font-extrabold text-zinc-900">척도 통계</span>
          <span className="mx-2 text-zinc-300">|</span>
          <span>n={stats.n}</span>
          <span className="mx-2 text-zinc-300">|</span>
          <span>평균 {stats.mean.toFixed(2)}</span>
          <span className="mx-2 text-zinc-300">|</span>
          <span>표준편차 {stats.std.toFixed(2)}</span>
        </div>
      )}

      <ul className="space-y-2">
        {visible.map((o) => (
          <li key={o.label} className="rounded-2xl border border-zinc-200/70 bg-white/70 p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-extrabold text-zinc-900">{o.label}</div>
                <div className="mt-2 h-2 w-full rounded-full bg-zinc-100">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                    style={{ width: `${Math.min(100, Math.max(0, o.rate))}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-zinc-600">
                <div className="font-extrabold text-zinc-900">{o.rate}%</div>
                <div>{o.count}명</div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2 text-xs font-extrabold text-zinc-800 shadow-sm hover:bg-white"
        >
          {expanded ? "접기" : `더보기 (${merged.length - initialShow}개)`}
        </button>
      )}
    </div>
  );
}
