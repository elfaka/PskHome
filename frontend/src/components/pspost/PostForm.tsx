"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

import { PsPostRequest, createPost, getPost, updatePost } from "@/api/pspost";
import Button from "@/components/ui/Button";
import Container from "@/components/ui/Container";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { cardClass } from "@/components/ui/Card";
import { errorMessage } from "@/lib/errorMessage";

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

/** 메타 입력칸 정의 — 라벨/placeholder 를 한곳에 모아 JSX 반복을 줄인다. */
const META_FIELDS: {
  key: keyof PsPostRequest;
  label: string;
  placeholder: string;
}[] = [
  { key: "title", label: "제목", placeholder: "예) 두 수의 합" },
  { key: "site", label: "사이트", placeholder: "BOJ / Programmers ..." },
  { key: "problemNumber", label: "문제 번호", placeholder: "예) 1000" },
  { key: "level", label: "난이도", placeholder: "Silver 2 / Lv2 ..." },
  { key: "language", label: "언어", placeholder: "Java / JS / TS / C++" },
  { key: "link", label: "문제 링크", placeholder: "https://..." },
];

/**
 * 새 글 작성/수정 공용 폼.
 *
 * `/pspost/new` 와 `/pspost/[id]/edit` 두 라우트가 같은 컴포넌트를 쓴다.
 * 수정 모드 여부는 라우트 파라미터 `id` 의 유무로 판단한다.
 * (새 글 라우트에는 `id` 가 없으므로 useParams 가 빈 객체를 준다)
 */
export default function PostForm() {
  const { id } = useParams<{ id?: string }>();
  const postId = id ? Number(id) : null;
  const isEdit = useMemo(
    () => (id ? Number.isFinite(postId) : false),
    [id, postId]
  );
  const router = useRouter();

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
    } catch (e) {
      alert(errorMessage(e, "불러오기 실패"));
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
        router.push(`/pspost/${postId}`);
      } else {
        const newId = await createPost(form);
        router.push(`/pspost/${newId}`);
      }
    } catch (e) {
      alert(errorMessage(e, "저장 실패"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container size="wide" className="py-10 sm:py-14">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/pspost"
          className="text-sm text-fg-muted underline-offset-4 transition hover:text-fg hover:underline"
        >
          ← 목록으로
        </Link>

        <Button variant="primary" disabled={loading} onClick={onSubmit}>
          {isEdit ? "수정 저장" : "등록"}
        </Button>
      </div>

      <div className={cardClass({ className: "mt-6 p-6 sm:p-8" })}>
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
          {isEdit ? "글 수정" : "새 글 작성"}
        </h1>

        <p className="mt-2 text-sm text-fg-muted">
          제목/메타정보를 입력하고, 마크다운으로 풀이를 작성하세요.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {META_FIELDS.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              htmlFor={`post-${field.key}`}
            >
              <Input
                id={`post-${field.key}`}
                value={form[field.key]}
                onChange={(e) => set(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            </Field>
          ))}
        </div>

        <Field
          className="mt-4"
          label="한 줄 요약"
          htmlFor="post-solution"
          hint="핵심 아이디어나 접근법을 한 문장으로."
        >
          <Input
            id="post-solution"
            value={form.solution}
            onChange={(e) => set("solution", e.target.value)}
            placeholder="예) 정렬 후 투 포인터로 O(n log n)"
          />
        </Field>

        {/* 편집기 + 미리보기 — 넓은 화면에서는 좌우로 나란히 둔다 */}
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field label="본문 (Markdown)" htmlFor="post-content">
            <Textarea
              id="post-content"
              value={form.contentMd}
              onChange={(e) => set("contentMd", e.target.value)}
              placeholder={
                "# 풀이\n\n## 아이디어\n- ...\n\n## 구현\n```java\n...\n```"
              }
              className="h-[32rem] font-mono"
            />
          </Field>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-fg-muted">미리보기</p>

            <div className="h-[32rem] overflow-auto rounded-control border border-line bg-surface-2 p-5">
              <div className="prose prose-app max-w-none">
                <ReactMarkdown>{form.contentMd || ""}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}
