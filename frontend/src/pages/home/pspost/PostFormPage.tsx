import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { PsPostRequest, createPost, getPost, updatePost } from "../../../api/pspost";

const empty: PsPostRequest = {
  title: "",
  site: "BOJ",
  problemNumber: "",
  link: "",
  level: "",
  language: "Java",
  solution: "",
  contentMd: "",
};

export default function PostFormPage() {
  const { id } = useParams();
  const postId = id ? Number(id) : null;
  const isEdit = useMemo(() => (id ? Number.isFinite(postId as any) : false), [id, postId]);
  const nav = useNavigate();

  const [form, setForm] = useState<PsPostRequest>(empty);
  const [loading, setLoading] = useState(false);

  async function loadForEdit() {
    if (!isEdit || postId == null) return;
    setLoading(true);
    try {
      const d = await getPost(postId);
      setForm({
        title: d.title ?? "",
        site: d.site ?? "",
        problemNumber: d.problemNumber ?? "",
        link: d.link ?? "",
        level: d.level ?? "",
        language: d.language ?? "",
        solution: d.solution ?? "",
        contentMd: d.contentMd ?? "",
      });
    } catch (e: any) {
      alert(e?.message || "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadForEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function set<K extends keyof PsPostRequest>(k: K, v: PsPostRequest[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function onSubmit() {
    if (!form.title.trim()) return alert("제목은 필수입니다.");
    if (!form.site.trim()) return alert("사이트는 필수입니다.");
    if (!form.problemNumber.trim()) return alert("문제번호는 필수입니다.");

    setLoading(true);
    try {
      if (isEdit && postId != null) {
        await updatePost(postId, form);
        nav(`/pspost/${postId}`);
      } else {
        const newId = await createPost(form);
        nav(`/pspost/${newId}`);
      }
    } catch (e: any) {
      alert(e?.message || "저장 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link to="/pspost/" className="text-sm text-zinc-600 hover:underline">
          ← 목록으로
        </Link>

        <button
          disabled={loading}
          onClick={onSubmit}
          className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          {isEdit ? "수정 저장" : "등록"}
        </button>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
          {isEdit ? "글 수정" : "새 글 작성"}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          제목/메타정보를 입력하고, 마크다운으로 풀이를 작성하세요.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="제목"
            className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <input
            value={form.site}
            onChange={(e) => set("site", e.target.value)}
            placeholder="사이트 (BOJ/Programmers...)"
            className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <input
            value={form.problemNumber}
            onChange={(e) => set("problemNumber", e.target.value)}
            placeholder="문제 번호"
            className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <input
            value={form.level}
            onChange={(e) => set("level", e.target.value)}
            placeholder="난이도 (Silver 2 / Lv2 등)"
            className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <input
            value={form.language}
            onChange={(e) => set("language", e.target.value)}
            placeholder="언어 (Java/JS/TS/C++)"
            className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <input
            value={form.link}
            onChange={(e) => set("link", e.target.value)}
            placeholder="문제 링크"
            className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div className="mt-3">
          <input
            value={form.solution}
            onChange={(e) => set("solution", e.target.value)}
            placeholder="한 줄 요약(핵심 아이디어/접근법)"
            className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="space-y-2">
            <div className="text-sm font-semibold text-zinc-800">본문 (Markdown)</div>
            <textarea
              value={form.contentMd}
              onChange={(e) => set("contentMd", e.target.value)}
              placeholder={"# 풀이\n\n## 아이디어\n- ...\n\n## 구현\n```java\n...\n```"}
              className="h-[560px] w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm leading-7 outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </section>

          <section className="space-y-2">
            <div className="text-sm font-semibold text-zinc-800">미리보기</div>
            <div className="h-[560px] overflow-auto rounded-2xl border border-zinc-200 bg-white p-5">
              <div className="prose prose-zinc max-w-none">
                <ReactMarkdown>{form.contentMd || ""}</ReactMarkdown>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
