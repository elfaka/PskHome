import { useMemo, useState } from "react";

type Opt = { label: string; count: number; rate: number };

export default function ChoiceRenderer({
  options,
  initialShow = 12,
}: {
  options: Opt[];
  initialShow?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const safe = useMemo(() => options ?? [], [options]);
  const visible = expanded ? safe : safe.slice(0, initialShow);
  const hasMore = safe.length > initialShow;

  if (!safe.length) {
    return <div className="text-sm text-zinc-500">집계 결과 없음</div>;
  }

  return (
    <div className="space-y-3">
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
          {expanded ? "접기" : `더보기 (${safe.length - initialShow}개)`}
        </button>
      )}
    </div>
  );
}
