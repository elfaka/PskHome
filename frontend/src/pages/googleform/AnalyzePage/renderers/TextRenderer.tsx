import { useMemo, useState } from "react";

export default function TextRenderer({
  text,
  initialShow = 30,
}: {
  text?: { count: number; samples: string[] } | null;
  initialShow?: number;
}) {
  const [open, setOpen] = useState(false);

  const samples = useMemo(() => text?.samples ?? [], [text]);
  const count = text?.count ?? 0;

  async function copyAll() {
    // 엑셀에 붙여넣을 때 한 셀씩 들어가게: 줄바꿈(\n)으로 연결
    const payload = samples
      .map((s) => String(s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n"))
      .join("\n");
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // 클립보드 막힌 환경이면 무시(필요하면 fallback 추가 가능)
    }
  }

  if (!count) {
    return <div className="text-sm text-zinc-500">응답 없음</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-zinc-700">
          응답 수: <span className="font-semibold text-zinc-900">{count}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyAll}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
            title="줄바꿈으로 연결되어 엑셀에 붙여넣으면 한 셀씩 세로로 들어갑니다."
          >
            전체 복사(엑셀)
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            {open ? "접기" : "펼치기"}
          </button>
        </div>
      </div>

      {open && (
        <ul className="space-y-2">
          {samples.slice(0, initialShow).map((s, idx) => (
            <li key={idx} className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="text-xs text-zinc-500">샘플 {idx + 1}</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-800">
                {s}
              </div>
            </li>
          ))}
          {samples.length > initialShow && (
            <li className="text-xs text-zinc-500">
              (샘플이 많아 상위 {initialShow}개만 표시 중)
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
