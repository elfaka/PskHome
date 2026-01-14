import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../../api";

type AnalyzeResult = {
  meta: { formId: string; title: string; analyzedResponses: number };
  summaries: Array<{
    questionId: string;
    questionTitle: string;
    type: string;
    options: Array<{ label: string; count: number; rate: number }>;
    text?: { count: number; samples: string[] } | null;
  }>;
};

export default function AnalyzePage() {
  const { formId } = useParams();
  const [limit, setLimit] = useState(200);
  const [data, setData] = useState<AnalyzeResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  async function load() {
    if (!formId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<AnalyzeResult>(
        `/api/forms/${formId}/analyze?limit=${limit}`
      );
      setData(res.data);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Failed to analyze");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]);

  const summaries = useMemo(() => {
    const t = filter.trim().toLowerCase();
    if (!data) return [];
    if (!t) return data.summaries;
    return data.summaries.filter((s) =>
      s.questionTitle.toLowerCase().includes(t)
    );
  }, [data, filter]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-zinc-900">분석 결과</h2>
          <Link
            to="/googleform/forms"
            className="mt-1 inline-block text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← 목록
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="질문 검색..."
            className="w-60 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300"
          />

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">limit</span>
            <input
              type="number"
              value={limit}
              min={1}
              max={500}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-24 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            />
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading ? "Loading..." : "Reload"}
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {err}
        </div>
      )}

      {data && (
        <>
          <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-lg font-black text-zinc-900">{data.meta.title}</div>
            <div className="mt-2 text-sm text-zinc-600">
              analyzedResponses: {data.meta.analyzedResponses}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {summaries.map((q) => (
              <div
                key={q.questionId}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="text-base font-extrabold text-zinc-900">
                  {q.questionTitle}
                </div>
                <div className="mt-1 text-xs text-zinc-500">{q.type}</div>

                <div className="mt-4">
                  {q.type === "TEXT" || q.type === "UNKNOWN" ? (
                    <div>
                      <div className="mb-2 text-sm text-zinc-700">
                        응답 수: {q.text?.count ?? 0}
                      </div>

                      {q.text?.samples?.length ? (
                        <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-800">
                          {q.text.samples.map((s, idx) => (
                            <li key={idx} className="whitespace-pre-wrap break-words">
                              {s}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-sm text-zinc-500">샘플 없음</div>
                      )}
                    </div>
                  ) : (
                    <div>
                      {q.options?.length ? (
                        <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-800">
                          {q.options.slice(0, 30).map((o) => (
                            <li key={o.label} className="break-words">
                              <span className="font-semibold text-zinc-900">{o.label}</span>
                              <span className="text-zinc-600">
                                {" "}
                                — {o.count} ({o.rate}%)
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-sm text-zinc-500">집계 결과 없음</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
