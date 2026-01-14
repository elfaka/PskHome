import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../api";

type FormItem = {
  formId: string;
  name: string;
  modifiedTime?: string | null;
};

export default function FormsList() {
  const [items, setItems] = useState<FormItem[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<FormItem[]>("/api/forms");
        setItems(res.data);
      } catch (e: any) {
        setErr(e?.response?.data?.message || e?.message || "Failed to load forms");
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((x) => x.name.toLowerCase().includes(t));
  }, [items, q]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-zinc-900">내 설문 목록</h2>
          <p className="mt-1 text-sm text-zinc-600">
            설문을 선택하면 분석 페이지로 이동합니다.
          </p>
        </div>

        <div className="w-full max-w-sm">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="검색..."
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300"
          />
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {err}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((f) => (
          <Link
            key={f.formId}
            to={`/googleform/forms/${f.formId}/analyze`}
            className="group rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-[1px] hover:border-zinc-300 hover:shadow"
          >
            <div className="text-base font-extrabold text-zinc-900">
              {f.name}
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              modified: {f.modifiedTime ?? "-"}
            </div>
            <div className="mt-4 text-sm font-semibold text-zinc-800">
              분석 보기 <span className="opacity-70">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
