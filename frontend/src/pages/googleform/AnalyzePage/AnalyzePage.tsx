import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../../api";
import QuestionCard from "./QuestionCard";

type Opt = { label: string; count: number; rate: number; score?: number | string; value?: number | string };

type Summary = {
  questionId: string;
  questionTitle: string;
  type: string;
  options: Opt[];
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
  if (x.includes("UNKNOWN")) return "SCALE"; // 선형배율 등
  if (x.includes("CHOICE")) return "CHOICE";
  return x || "UNKNOWN";
}

function csvEscape(v: any) {
  const s = String(v ?? "");
  // CSV 안전 처리
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AnalyzePage() {
  const { formId } = useParams();
  const [limit, setLimit] = useState(200);
  const [data, setData] = useState<AnalyzeResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 기존: 검색
  const [filter, setFilter] = useState("");

  // ✅ 다음 스텝: 타입 필터
  const [typeFilter, setTypeFilter] = useState<"ALL" | "CHOICE" | "SCALE" | "TEXT">("ALL");

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
      // 검색
      const okText = !t || s.questionTitle.toLowerCase().includes(t);

      // 타입 필터
      const nt = normalizeType(s.type);
      const okType = typeFilter === "ALL" ? true : nt === typeFilter;

      return okText && okType;
    });
  }, [data, filter, typeFilter]);

  const questionCountAll = data?.summaries?.length ?? 0;
  const questionCountShown = filteredSummaries.length;
  const analyzedResponses = data?.meta?.analyzedResponses ?? 0;

  // ✅ CSV 내보내기 (현재 필터 반영)
  function exportCsv() {
    if (!data) return;

    const rows: string[] = [];
    rows.push(
      [
        "FormTitle",
        "QuestionTitle",
        "Type",
        "OptionLabel",
        "Count",
        "Rate",
        "TextSample",
      ].join(",")
    );

    for (const q of filteredSummaries) {
      const nt = normalizeType(q.type);

      if (nt === "TEXT") {
        const samples = q.text?.samples ?? [];
        if (!samples.length) {
          rows.push(
            [
              csvEscape(data.meta.title),
              csvEscape(q.questionTitle),
              csvEscape(q.type),
              "", "", "",
              csvEscape(""),
            ].join(",")
          );
        } else {
          for (const s of samples) {
            rows.push(
              [
                csvEscape(data.meta.title),
                csvEscape(q.questionTitle),
                csvEscape(q.type),
                "", "", "",
                csvEscape(String(s).replace(/\r\n/g, "\n").replace(/\r/g, "\n")),
              ].join(",")
            );
          }
        }
      } else {
        const opts = q.options ?? [];
        if (!opts.length) {
          rows.push(
            [
              csvEscape(data.meta.title),
              csvEscape(q.questionTitle),
              csvEscape(q.type),
              "", "", "",
              "",
            ].join(",")
          );
        } else {
          for (const o of opts) {
            rows.push(
              [
                csvEscape(data.meta.title),
                csvEscape(q.questionTitle),
                csvEscape(q.type),
                csvEscape(o.label),
                csvEscape(o.count),
                csvEscape(o.rate),
                "",
              ].join(",")
            );
          }
        }
      }
    }

    // Excel 호환 BOM
    const bom = "\ufeff";
    downloadText(`analyze_${data.meta.formId}.csv`, bom + rows.join("\n"));
  }

  return (
    <div>
      {/* 상단바 */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-zinc-900">분석 결과</h2>
          <Link to="/googleform/forms" className="mt-1 inline-block text-sm text-zinc-600 hover:text-zinc-900">
            ← 목록
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 검색 */}
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="질문 검색..."
            className="w-60 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300"
          />

          {/* ✅ 타입 필터 */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300"
          >
            <option value="ALL">전체</option>
            <option value="CHOICE">객관식</option>
            <option value="SCALE">척도</option>
            <option value="TEXT">주관식</option>
          </select>

          {/* limit */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">limit</span>
            <input
              type="number"
              value={limit}
              min={1}
              max={2000}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-28 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            />
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading ? "Loading..." : "Reload"}
          </button>

          {/* ✅ CSV */}
          <button
            onClick={exportCsv}
            disabled={!data}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
          >
            CSV 내보내기
          </button>
        </div>
      </div>

      {/* 메타 */}
      {data && (
        <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="text-lg font-black text-zinc-900">{data.meta.title}</div>

            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1">
                문항 <span className="font-semibold text-zinc-900">{questionCountShown}</span>
                <span className="text-zinc-500">/{questionCountAll}</span>
              </span>
              <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1">
                응답 <span className="font-semibold text-zinc-900">{analyzedResponses}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {err && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {err}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {filteredSummaries.map((q) => (
          <QuestionCard key={q.questionId} q={q} />
        ))}
      </div>
    </div>
  );
}
