"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import { PsPost, deletePost, getPost } from "@/api/pspost";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button, { buttonClass } from "@/components/ui/Button";
import { cardClass } from "@/components/ui/Card";
import Container from "@/components/ui/Container";
import Skeleton from "@/components/ui/Skeleton";
import { errorMessage } from "@/lib/errorMessage";

function fmtDateTime(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const postId = Number(id);
  const router = useRouter();

  const [data, setData] = useState<PsPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const d = await getPost(postId);
      setData(d);
    } catch (e) {
      setErr(errorMessage(e, "조회 실패"));
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!confirm("삭제할까요?")) return;
    try {
      await deletePost(postId);
      router.push("/pspost");
    } catch (e) {
      alert(errorMessage(e, "삭제 실패"));
    }
  }

  useEffect(() => {
    if (!Number.isFinite(postId)) return;
    load();
  }, [postId]);

  return (
    <Container className="py-10 sm:py-14">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/pspost"
          className="text-sm text-fg-muted underline-offset-4 transition hover:text-fg hover:underline"
        >
          ← 목록으로
        </Link>

        <div className="flex gap-2">
          <Link
            href={`/pspost/${postId}/edit`}
            className={buttonClass({ size: "sm" })}
          >
            수정
          </Link>

          <Button variant="danger" size="sm" onClick={onDelete}>
            삭제
          </Button>
        </div>
      </div>

      {loading && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-64 w-full rounded-card" />
        </div>
      )}

      {!!err && <Alert className="mt-6">{err}</Alert>}

      {data && (
        <article className={cardClass({ className: "mt-6 p-6 sm:p-8" })}>
          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
              {data.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge>{data.site}</Badge>
              <Badge>#{data.problemNumber}</Badge>
              <Badge>{data.language}</Badge>
              <Badge>{data.level}</Badge>

              {data.isSolved ? (
                <Badge tone="success">Solved</Badge>
              ) : (
                <Badge tone="warning">Unsolved</Badge>
              )}

              <time className="ml-auto text-xs text-fg-subtle">
                {fmtDateTime(data.createdAt)}
              </time>
            </div>

            {data.link ? (
              <a
                href={data.link}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-soft-fg underline-offset-4 hover:underline"
              >
                문제 링크 열기 <span aria-hidden>↗</span>
              </a>
            ) : null}

            {data.solution ? (
              <div className="mt-4 rounded-card border border-accent/25 bg-accent-soft px-4 py-3">
                <div className="text-xs font-semibold text-accent-soft-fg">
                  한 줄 요약
                </div>

                <p className="mt-1 text-sm leading-relaxed text-fg">
                  {data.solution}
                </p>
              </div>
            ) : null}

            <div className="mt-6 h-px bg-line" />
          </header>

          {/*
            prose-app 이 typography 플러그인의 색을 테마 토큰으로 덮는다.
            (기존 `prose prose-zinc` 는 플러그인이 설치돼 있지 않아 아무 효과가 없었다)
          */}
          <div className="prose prose-app mt-6 max-w-none">
            <ReactMarkdown>{data.contentMd || ""}</ReactMarkdown>
          </div>
        </article>
      )}
    </Container>
  );
}
