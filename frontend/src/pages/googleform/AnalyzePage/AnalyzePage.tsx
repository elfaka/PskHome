import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../../api";
import QuestionCard from "./QuestionCard";

type AllOpt = { label: string; order?: number | null; value?: string | null; score?: number | null };
type StatOpt = { label: string; count: number; rate: number };

type Summary = {
  questionId: string;
  questionTitle: string;
  type: string;
  allOptions?: AllOpt[];
  options: StatOpt[];
  text?: { count: number; samples: string[] } | null;
};

type AnalyzeResult = {
  meta: { formId: string; title: string; analyzedResponses: number };
  summaries: Summary[];
};

function normalizeType(t: string) {
  const x = (t || "").toUpperCase();
  if (x.includes("TEXT")) return "TEXT";
  if (x.includes("SCALE")) return "SCALE";
  if (x.includes("UNKNOWN")) return "SCALE";
  if (x.includes("CHOICE")) return "CHOICE";
  return x || "UNKNOWN";
}

function typeBadge(nt: string) {
  switch (nt) {
    case "CHOICE":
      return { label: "객관식", cls: "bg-sky-100 text-sky-700 ring-sky-200" };
    case "SCALE":
      return { label: "척도", cls: "bg-violet-100 text-violet-700 ring-violet-200" };
    case "TEXT":
      return { label: "주관식", cls: "bg-emerald-100 text-emerald-700 ring-emerald-200" };
    default:
      return { label: nt, cls: "bg-zinc-100 text-zinc-700 ring-zinc-200" };
  }
}

function getMiniDesc(q: Summary) {
  const nt = normalizeType(q.type);

  if (nt === "TEXT") {
    const n = q.text?.count ?? 0;
    return `주관식 · 응답 ${n}`;
  }

  const optsTotal =
    (q.allOptions?.length ?? 0) > 0 ? (q.allOptions?.length ?? 0) : (q.options?.length ?? 0);

  const answeredOptions = (q.options ?? []).filter((o) => (o.count ?? 0) > 0).length;

  const top = [...(q.options ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
  const topText = top ? `TOP: ${top.label} (${top.rate}%)` : "TOP: -";

  if (nt === "SCALE") return `척도 · 보기 ${optsTotal} · ${topText}`;
  return `객관식 · 보기 ${optsTotal} · 응답보기 ${answeredOptions} · ${topText}`;
}

export default function AnalyzePage() {
  const { formId } = useParams();

  const [limit, setLimit] = useState(200);
  const [data, setData] = useState<AnalyzeResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "CHOICE" | "SCALE" | "TEXT">("ALL");

  // ✅ 맨 위로 이동용 ref
  const topRef = useRef<HTMLDivElement | null>(null);

  // 문항카드로 이동(ref map)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  async function load() {
    if (!formId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<AnalyzeResult>(`/api/forms/${formId}/analyze?limit=${limit}`);
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

  const filteredSummaries = useMemo(() => {
    if (!data) return [];
    const t = filter.trim().toLowerCase();
    return data.summaries.filter((s) => {
      const okText = !t || s.questionTitle.toLowerCase().includes(t);
      const nt = normalizeType(s.type);
      const okType = typeFilter === "ALL" ? true : nt === typeFilter;
      return okText && okType;
    });
  }, [data, filter, typeFilter]);

  const questionCountAll = data?.summaries?.length ?? 0;
  const questionCountShown = filteredSummaries.length;
  const analyzedResponses = data?.meta?.analyzedResponses ?? 0;

  function scrollToQuestion(questionId: string) {
    const el = cardRefs.current[questionId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToTop() {
    const el = topRef.current;
    if (!el) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen">
      {/* ✅ 최상단 앵커 */}
      <div ref={topRef} />

      <div className="rounded-3xl bg-gradient-to-b from-[#f6f7ff] to-[#ffffef] p-4 sm:p-6">
        {/* 상단 */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-zinc-900">분석 결과</h2>
            <Link
              to="/googleform/forms"
              className="mt-1 inline-block text-sm font-semibold text-zinc-600 hover:text-zinc-900"
            >
              ← 목록
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="질문 검색..."
              className="w-60 rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
            />

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="rounded-2xl border border-zinc-200 bg-white/80 px-3 py-3 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              <option value="ALL">전체</option>
              <option value="CHOICE">객관식</option>
              <option value="SCALE">척도</option>
              <option value="TEXT">주관식</option>
            </select>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-500">limit</span>
              <input
                type="number"
                value={limit}
                min={1}
                max={2000}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-28 rounded-2xl border border-zinc-200 bg-white/80 px-3 py-3 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>

            <button
              onClick={load}
              disabled={loading}
              className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60"
            >
              {loading ? "Loading..." : "Reload"}
            </button>
          </div>
        </div>

        {/* 메타 */}
        {data && (
          <div className="mb-5 rounded-3xl border border-zinc-200/70 bg-white/70 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="text-lg font-black text-zinc-900">{data.meta.title}</div>

              <div className="flex items-center gap-2 text-sm text-zinc-700">
                <span className="rounded-xl bg-white/70 px-3 py-1.5 ring-1 ring-zinc-200">
                  문항 <span className="font-extrabold text-zinc-900">{questionCountShown}</span>
                  <span className="text-zinc-500">/{questionCountAll}</span>
                </span>
                <span className="rounded-xl bg-white/70 px-3 py-1.5 ring-1 ring-zinc-200">
                  응답 <span className="font-extrabold text-zinc-900">{analyzedResponses}</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {err && (
          <div className="mb-5 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 shadow-sm">
            {err}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* 왼쪽: 문항 요약 */}
          <aside className="sticky top-4 h-[calc(100vh-140px)] overflow-auto rounded-3xl border border-zinc-200/70 bg-white/70 p-3 shadow-sm backdrop-blur">
            <div className="mb-2 px-2 text-xs font-extrabold uppercase tracking-wider text-zinc-500">
              Questions
            </div>

            <div className="space-y-2">
              {filteredSummaries.map((q, idx) => {
                const nt = normalizeType(q.type);
                const badge = typeBadge(nt);
                return (
                  <button
                    key={q.questionId}
                    onClick={() => scrollToQuestion(q.questionId)}
                    className="group w-full rounded-2xl border border-transparent bg-white/60 p-3 text-left shadow-sm hover:border-violet-200 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold text-zinc-900">
                          {idx + 1}. {q.questionTitle}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs font-medium text-zinc-600">
                          {getMiniDesc(q)}
                        </div>
                      </div>

                      <span className={`shrink-0 rounded-xl px-2 py-1 text-xs font-extrabold ring-1 ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>

                    <div className="mt-2 text-xs font-semibold text-violet-700 opacity-0 transition group-hover:opacity-100">
                      클릭해서 이동 →
                    </div>
                  </button>
                );
              })}

              {!filteredSummaries.length && (
                <div className="rounded-2xl bg-white/70 p-4 text-sm text-zinc-600 ring-1 ring-zinc-200">
                  표시할 문항이 없습니다.
                </div>
              )}
            </div>
          </aside>

          {/* 오른쪽: 1열 카드 */}
          <main className="space-y-4">
            {filteredSummaries.map((q, idx) => {
              const nt = normalizeType(q.type);
              const badge = typeBadge(nt);

              return (
                <div
                  key={q.questionId}
                  ref={(el) => {
                    cardRefs.current[q.questionId] = el;
                  }}
                  className="scroll-mt-24"
                >
                  {/* ✅ 카드 상단: Q번호 / 배지 / 맨 위로 */}
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-sm font-extrabold text-zinc-700">Q{idx + 1}</div>

                    <div className="flex items-center gap-2">
                      <span className={`rounded-xl px-2 py-1 text-xs font-extrabold ring-1 ${badge.cls}`}>
                        {badge.label}
                      </span>

                      <button
                        onClick={scrollToTop}
                        className="rounded-xl border border-zinc-200 bg-white/70 px-3 py-1.5 text-xs font-extrabold text-zinc-800 shadow-sm hover:bg-white"
                      >
                        맨 위로 ↑
                      </button>
                    </div>
                  </div>

                  <QuestionCard q={q} />
                </div>
              );
            })}
          </main>
        </div>
      </div>
    </div>
  );
}
