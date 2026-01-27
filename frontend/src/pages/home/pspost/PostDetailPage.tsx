import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { PsPost, deletePost, getPost } from "../../../api/pspost";

function fmtDateTime(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

export default function PostDetailPage() {
  const { id } = useParams();
  const postId = Number(id);
  const nav = useNavigate();

  const [data, setData] = useState<PsPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const d = await getPost(postId);
      setData(d);
    } catch (e: any) {
      setErr(e?.message || "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!confirm("삭제할까요?")) return;
    try {
      await deletePost(postId);
      nav("/pspost/");
    } catch (e: any) {
      alert(e?.message || "삭제 실패");
    }
  }

  useEffect(() => {
    if (!Number.isFinite(postId)) return;
    load();
  }, [postId]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link to="/pspost/" className="text-sm text-zinc-600 hover:underline">
          ← 목록으로
        </Link>

        <div className="flex gap-2">
          <Link
            to={`/pspost/${postId}/edit`}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            수정
          </Link>
          <button
            onClick={onDelete}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 shadow-sm hover:bg-red-100"
          >
            삭제
          </button>
        </div>
      </div>

      {loading && <div className="text-sm text-zinc-500">불러오는 중…</div>}
      {!!err && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {err}
        </div>
      )}

      {data && (
        <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <header className="space-y-4">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
              {data.title}
            </h1>

            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-700">
              <span className="rounded-full bg-zinc-100 px-2 py-1">{data.site}</span>
              <span className="rounded-full bg-zinc-100 px-2 py-1">#{data.problemNumber}</span>
              <span className="rounded-full bg-zinc-100 px-2 py-1">{data.language}</span>
              <span className="rounded-full bg-zinc-100 px-2 py-1">{data.level}</span>

              {data.isSolved ? (
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                  Solved
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                  Unsolved
                </span>
              )}

              <span className="ml-auto text-xs text-zinc-500">
                {fmtDateTime(data.createdAt)}
              </span>
            </div>

            {data.link ? (
              <a
                href={data.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:underline"
              >
                문제 링크 열기 <span aria-hidden>↗</span>
              </a>
            ) : null}

            {data.solution ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-sm text-zinc-800">
                <div className="mb-1 text-xs font-semibold text-emerald-700">
                  한 줄 요약
                </div>
                {data.solution}
              </div>
            ) : null}

            <div className="h-px bg-zinc-100" />
          </header>

          <div className="prose prose-zinc mt-6 max-w-none">
            <ReactMarkdown>{data.contentMd || ""}</ReactMarkdown>
          </div>
        </article>
      )}
    </div>
  );
}
