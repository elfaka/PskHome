import { useMemo, useState } from "react";

type AllOpt = { label: string; order?: number | null; value?: string | null; score?: number | null };
type StatOpt = { label: string; count: number; rate: number };

function mergeAllOptions(allOptions: AllOpt[] | undefined, stats: StatOpt[] | undefined) {
  const all = allOptions ?? [];
  const map = new Map((stats ?? []).map((s) => [s.label, s]));

  const merged = all.map((o) => {
    const hit = map.get(o.label);
    return {
      label: o.label,
      order: o.order ?? null,
      count: hit?.count ?? 0,
      rate: hit?.rate ?? 0,
    };
  });

  if (!merged.length && (stats ?? []).length) {
    return (stats ?? []).map((s) => ({ label: s.label, order: null, count: s.count, rate: s.rate }));
  }

  merged.sort((a, b) => {
    const ao = a.order ?? 999999;
    const bo = b.order ?? 999999;
    if (ao !== bo) return ao - bo;
    return String(a.label).localeCompare(String(b.label), "ko");
  });

  return merged;
}

export default function ChoiceRenderer({
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

  if (!merged.length) return <div className="text-sm text-zinc-500">집계 결과 없음</div>;

  return (
    <div className="space-y-3">
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
