"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PsPost, listPosts } from "@/api/pspost";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button, { buttonClass } from "@/components/ui/Button";
import Container from "@/components/ui/Container";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { Input } from "@/components/ui/Field";
import { cardClass } from "@/components/ui/Card";
import { errorMessage } from "@/lib/errorMessage";

function fmtDate(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString();
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
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
    } catch (e) {
      setErr(errorMessage(e, "목록 조회 실패"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Container className="py-12 sm:py-16">
      <PageHeader
        eyebrow="Problem Solving"
        title="PS 기록"
        description="풀었던 문제를 정리하고, 나만의 풀이 아카이브를 만듭니다."
        actions={
          <>
            <Button onClick={() => load(page)} disabled={loading}>
              새로고침
            </Button>

            <Link
              href="/pspost/new"
              className={buttonClass({ variant: "primary" })}
            >
              새 글 작성
            </Link>
          </>
        }
      />

      {/* 검색 — 서버 요청 없이 현재 페이지 안에서만 걸러낸다 */}
      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle">
            <SearchIcon />
          </span>

          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="제목 / 사이트 / 문제번호 / 언어 / 요약 검색"
            aria-label="게시글 검색"
            className="pl-9"
          />
        </div>

        <div className="text-sm text-fg-subtle">
          현재 {filtered.length}개 / 전체 {totalElements}개
        </div>
      </div>

      {!!err && <Alert className="mt-6">{err}</Alert>}

      {/* 목록 */}
      <div className="mt-6 grid grid-cols-1 gap-3">
        {loading &&
          /* 실제 카드와 비슷한 높이를 잡아 데이터가 들어올 때 화면이 튀지 않게 한다 */
          Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-card" />
          ))}

        {!loading &&
          filtered.map((p) => (
            <Link
              key={p.id}
              href={`/pspost/${p.id}`}
              className={cardClass({
                interactive: true,
                className: "group block p-5",
              })}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-fg transition group-hover:text-accent-soft-fg">
                    {p.title}
                  </h2>

                  {p.solution ? (
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-fg-muted">
                      {p.solution}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-fg-subtle">요약 없음</p>
                  )}
                </div>

                <time className="shrink-0 text-xs text-fg-subtle">
                  {fmtDate(p.createdAt)}
                </time>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge>{p.site || "Site"}</Badge>
                <Badge>#{p.problemNumber || "-"}</Badge>
                <Badge>{p.language || "Lang"}</Badge>
                <Badge>{p.level || "Level"}</Badge>

                {p.isSolved ? (
                  <Badge tone="success">Solved</Badge>
                ) : (
                  <Badge tone="warning">Unsolved</Badge>
                )}
              </div>
            </Link>
          ))}

        {!loading && !err && items.length === 0 && (
          <EmptyState
            title="아직 글이 없어요"
            description="첫 기록을 남겨볼까요?"
            action={
              <Link
                href="/pspost/new"
                className={buttonClass({ variant: "primary" })}
              >
                새 글 작성
              </Link>
            }
          />
        )}

        {!loading && !err && items.length > 0 && filtered.length === 0 && (
          <EmptyState
            title="검색 결과가 없습니다"
            description={`이 페이지에서 "${q}" 와 맞는 기록을 찾지 못했습니다.`}
          />
        )}
      </div>

      {/* 페이지 이동 */}
      <div className="mt-10 flex items-center justify-between">
        <Button disabled={loading || page <= 0} onClick={() => load(page - 1)}>
          이전
        </Button>

        <div className="text-sm text-fg-muted">
          {totalPages === 0 ? "0 / 0" : `${page + 1} / ${totalPages}`}
        </div>

        <Button
          disabled={loading || totalPages === 0 || page >= totalPages - 1}
          onClick={() => load(page + 1)}
        >
          다음
        </Button>
      </div>
    </Container>
  );
}
