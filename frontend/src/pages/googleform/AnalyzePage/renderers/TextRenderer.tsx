import { useMemo, useState } from "react";

export default function TextRenderer({
  text,
  maxShow = 200,
}: {
  text?: { count: number; samples: string[] } | null;
  maxShow?: number;
}) {
  const [open, setOpen] = useState(false);

  const samples = useMemo(() => text?.samples ?? [], [text]);
  const count = text?.count ?? 0;

  async function copyAllExcel() {
    const payload = samples
      .slice(0, maxShow)
      .map((s) => String(s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n"))
      .join("\n");
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // ignore
    }
  }

  if (!count) return <div className="text-sm text-zinc-500">응답 없음</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-zinc-700">
          응답 수: <span className="font-extrabold text-zinc-900">{count}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyAllExcel}
            className="rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2 text-xs font-extrabold text-zinc-800 shadow-sm hover:bg-white"
            title="엑셀에 붙여넣기 하면 한 줄이 한 셀(세로)로 들어갑니다."
          >
            전체 복사(엑셀)
          </button>

          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2 text-xs font-extrabold text-white shadow-sm hover:opacity-95"
          >
            {open ? "접기" : "펼치기"}
          </button>
        </div>
      </div>

      {open && (
        <ul className="space-y-2">
          {samples.slice(0, maxShow).map((s, idx) => (
            <li key={idx} className="rounded-2xl border border-zinc-200/70 bg-white/70 p-3 shadow-sm">
              <div className="text-xs font-semibold text-zinc-500">샘플 {idx + 1}</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-800">{s}</div>
            </li>
          ))}
          {samples.length > maxShow && (
            <li className="text-xs font-semibold text-zinc-500">(샘플이 많아 상위 {maxShow}개만 표시 중)</li>
          )}
        </ul>
      )}
    </div>
  );
}
