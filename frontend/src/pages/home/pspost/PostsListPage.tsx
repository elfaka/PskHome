import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PsPost, listPosts } from "../../../api/pspost";

function fmtDate(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString();
}

export default function PostsListPage() {
  const [items, setItems] = useState<PsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  const [page, setPage] = useState(0);
  const [size] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return items;
    return items.filter((p) => {
      const hay = [
        p.title,
        p.site,
        p.problemNumber,
        p.level,
        p.language,
        p.solution,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(k);
    });
  }, [items, q]);

  async function load(nextPage = page) {
    setLoading(true);
    setErr("");
    try {
      const data = await listPosts(nextPage, size);
      setItems(data.content ?? []);
      setTotalPages(data.totalPages ?? 0);
      setTotalElements(data.totalElements ?? 0);
      setPage(data.number ?? nextPage);
    } catch (e: any) {
      setErr(e?.message || "목록 조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
            PS 기록
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            풀었던 문제를 정리하고, 나만의 풀이 아카이브를 만듭니다.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => load(page)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            새로고침
          </button>
          <Link
            to="/pspost/new"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            새 글 작성
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xl">
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-emerald-200">
            <span className="text-zinc-400">⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="제목 / 사이트 / 문제번호 / 언어 / 요약 검색"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>
        <div className="text-sm text-zinc-500">
          현재 {filtered.length}개 / 전체 {totalElements}개
        </div>
      </div>

      {/* States */}
      {loading && <div className="text-sm text-zinc-500">불러오는 중…</div>}
      {!!err && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4">
        {filtered.map((p) => (
          <Link
            key={p.id}
            to={`/pspost/${p.id}`}
            className="group rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-zinc-900 group-hover:text-emerald-700">
                    {p.title}
                  </h2>

                  {p.solution ? (
                    <p className="mt-2 text-sm leading-6 text-zinc-600">
                      {p.solution}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-400">요약 없음</p>
                  )}
                </div>

                <div className="shrink-0 text-xs text-zinc-500">
                  {fmtDate(p.createdAt)}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">
                  {p.site || "Site"}
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">
                  #{p.problemNumber || "-"}
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">
                  {p.language || "Lang"}
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">
                  {p.level || "Level"}
                </span>
                {p.isSolved ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                    Solved
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                    Unsolved
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}

        {!loading && !err && items.length === 0 && (
          <div className="rounded-3xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 shadow-sm">
            아직 글이 없어요. 첫 기록을 남겨볼까요?
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="mt-8 flex items-center justify-between">
        <button
          disabled={loading || page <= 0}
          onClick={() => load(page - 1)}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 shadow-sm disabled:opacity-50"
        >
          이전
        </button>

        <div className="text-sm text-zinc-600">
          {totalPages === 0 ? "0 / 0" : `${page + 1} / ${totalPages}`}
        </div>

        <button
          disabled={loading || totalPages === 0 || page >= totalPages - 1}
          onClick={() => load(page + 1)}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 shadow-sm disabled:opacity-50"
        >
          다음
        </button>
      </div>
    </div>
  );
}
