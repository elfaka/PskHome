"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/api/client";
import Alert from "@/components/ui/Alert";
import Badge, { BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { Input, Select } from "@/components/ui/Field";
import { cardClass } from "@/components/ui/Card";
import { errorMessage } from "@/lib/errorMessage";

import QuestionCard from "./QuestionCard";

/**
 * 옵션 메타(백엔드가 내려주면 0응답 보기 표시 / 정렬 안정화에 활용)
 * - label: 보기 라벨
 * - order: 보기 순서
 * - score: scale(척도)일 경우 점수로 활용 가능
 */
type AllOpt = {
  label: string;
  order?: number | null;
  value?: string | null;
  score?: number | null;
};

/**
 * 집계 결과(응답이 실제 존재하는 보기들에 대한 통계)
 */
type StatOpt = { label: string; count: number; rate: number };

/**
 * AnalyzeResultDto.QuestionSummary에 대응하는 프론트 타입
 * - type에 따라 options 또는 text가 사용됨
 */
type Summary = {
  questionId: string;
  questionTitle: string;
  type: string;
  allOptions?: AllOpt[];
  options: StatOpt[];
  text?: { count: number; samples: string[] } | null;
};

/**
 * AnalyzeResultDto 전체 응답 타입
 * - meta + summaries로 구성
 */
type AnalyzeResult = {
  meta: { formId: string; title: string; analyzedResponses: number };
  summaries: Summary[];
};

/**
 * normalizeType
 *
 * [역할]
 * - 백엔드에서 type 값이 조금씩 달라도 프론트 렌더링 분기가 흔들리지 않도록
 *   내부적으로 CHOICE / SCALE / TEXT 로 정규화한다.
 *
 * [예]
 * - UNKNOWN 이더라도 실제로는 선형 배율처럼 처리하고 싶어서 SCALE로 취급
 */
function normalizeType(t: string) {
  const x = (t || "").toUpperCase();
  if (x.includes("TEXT")) return "TEXT";
  if (x.includes("SCALE")) return "SCALE";
  if (x.includes("UNKNOWN")) return "SCALE"; // 선형배율 등 UNKNOWN을 척도로 취급하는 정책
  if (x.includes("CHOICE")) return "CHOICE";
  return x || "UNKNOWN";
}

/**
 * typeBadge
 *
 * [역할]
 * - 문항 타입에 따른 UI 배지(라벨 + Badge tone)를 반환
 * - 사이드바/카드 상단에서 동일하게 재사용
 *
 * tone 은 서로 구분되는 세 색을 고른다.
 * (success 는 accent 와 같은 초록이라 SCALE/TEXT 가 같은 색으로 보이게 된다)
 */
function typeBadge(nt: string): { label: string; tone: BadgeTone } {
  switch (nt) {
    case "CHOICE":
      return { label: "객관식", tone: "info" };
    case "SCALE":
      return { label: "척도", tone: "accent" };
    case "TEXT":
      return { label: "주관식", tone: "warning" };
    default:
      return { label: nt, tone: "neutral" };
  }
}

/**
 * getMiniDesc
 *
 * [역할]
 * - 사이드바에서 보여줄 문항별 간략 설명(요약 텍스트)을 생성한다.
 * - “문항 카드 내용 전부를 보지 않고도” 대략적인 특징을 파악할 수 있게 만드는 UX 장치
 *
 * [표시 정책]
 * - TEXT: 주관식 응답 수 표시
 * - CHOICE/SCALE: 보기 수, 응답 있는 보기 수, TOP 옵션(라벨/비율) 표시
 */
function getMiniDesc(q: Summary) {
  const nt = normalizeType(q.type);

  if (nt === "TEXT") {
    const n = q.text?.count ?? 0;
    return `주관식 · 응답 ${n}`;
  }

  // 보기 수: allOptions가 있으면 그걸 기준(0응답 보기 포함), 아니면 집계 options 길이 기반
  const optsTotal =
    (q.allOptions?.length ?? 0) > 0 ? (q.allOptions?.length ?? 0) : (q.options?.length ?? 0);

  // 응답이 실제 있는 보기 개수
  const answeredOptions = (q.options ?? []).filter((o) => (o.count ?? 0) > 0).length;

  // TOP 보기(가장 많이 선택된 보기)
  const top = [...(q.options ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
  const topText = top ? `TOP: ${top.label} (${top.rate}%)` : "TOP: -";

  if (nt === "SCALE") return `척도 · 보기 ${optsTotal} · ${topText}`;
  return `객관식 · 보기 ${optsTotal} · 응답보기 ${answeredOptions} · ${topText}`;
}

/**
 * AnalyzePage
 *
 * [역할]
 * - /api/forms/{formId}/analyze 를 호출해 분석 결과를 가져오고,
 *   검색/필터/좌측 네비게이션/우측 카드 렌더링까지 담당하는 메인 화면
 *
 * [핵심 UX]
 * - 좌측: 문항 요약 리스트(클릭 시 해당 카드로 스크롤)
 * - 우측: 문항 카드 1열(각 카드 상단에 타입 배지 + 맨 위로 버튼)
 * - 상단: 검색/타입 필터/limit 조절 + Reload
 */
export default function AnalyzePage() {
  // 라우트 파라미터(/forms/:formId/analyze)
  const { formId } = useParams<{ formId: string }>();

  // API 조회 관련 상태
  const [limit, setLimit] = useState(200);
  const [data, setData] = useState<AnalyzeResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // UI 필터 상태(검색/타입)
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "CHOICE" | "SCALE" | "TEXT">("ALL");

  /**
   * 최상단 앵커 ref
   * - "맨 위로" 버튼 클릭 시 scrollIntoView로 이동하기 위해 사용
   */
  const topRef = useRef<HTMLDivElement | null>(null);

  /**
   * 문항 카드 ref 맵
   * - questionId를 key로 DOM 요소를 저장해두었다가
   *   사이드바에서 클릭 시 해당 카드로 smooth scroll 이동
   */
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /**
   * 분석 결과 로드
   *
   * - limit은 분석에 사용할 응답 수 제한(백엔드에서 안전 제한)
   * - 로딩/에러 상태를 관리해 UX 깔끔하게 유지
   */
  async function load() {
    if (!formId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<AnalyzeResult>(`/api/forms/${formId}/analyze?limit=${limit}`);
      setData(res.data);
    } catch (e) {
      // 서버 에러/네트워크 에러 메시지를 최대한 사용자 친화적으로 표시
      setErr(errorMessage(e, "Failed to analyze"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  /**
   * formId 변경 시 자동 로드
   * - eslint disable은 load()를 의존성 배열에 넣으면 매번 새로 생성되는 문제를 피하기 위한 패턴
   */
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]);

  /**
   * 검색/타입 필터 적용된 문항 목록
   * - data/검색어/타입필터가 바뀔 때만 계산(useMemo)
   */
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

  // 상단 메타 표시용 숫자들
  const questionCountAll = data?.summaries?.length ?? 0;
  const questionCountShown = filteredSummaries.length;
  const analyzedResponses = data?.meta?.analyzedResponses ?? 0;

  /**
   * 사이드바에서 특정 문항 클릭 → 해당 카드로 이동
   */
  function scrollToQuestion(questionId: string) {
    const el = cardRefs.current[questionId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /**
   * 카드 상단 "맨 위로" 버튼 클릭 → 상단으로 이동
   */
  function scrollToTop() {
    const el = topRef.current;
    if (!el) {
      // 혹시 ref가 없으면 안전하게 window scroll 사용
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div>
      {/* 최상단 앵커 — "맨 위로" 버튼이 여기로 스크롤한다 */}
      <div ref={topRef} className="scroll-mt-24" />

      {/* 상단: 페이지 타이틀 / 필터 / reload */}
      <PageHeader
        eyebrow="Analyze"
        title="분석 결과"
        description={data?.meta.title}
        actions={
          <>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="질문 검색..."
              aria-label="질문 검색"
              className="sm:w-52"
            />

            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              aria-label="문항 타입 필터"
              className="sm:w-28"
            >
              <option value="ALL">전체</option>
              <option value="CHOICE">객관식</option>
              <option value="SCALE">척도</option>
              <option value="TEXT">주관식</option>
            </Select>

            {/* limit: 분석에 사용할 응답 수 상한 */}
            <Input
              type="number"
              value={limit}
              min={1}
              max={2000}
              onChange={(e) => setLimit(Number(e.target.value))}
              aria-label="분석할 응답 수 상한"
              className="sm:w-24"
            />

            <Button variant="primary" onClick={load} disabled={loading}>
              {loading ? "Loading..." : "Reload"}
            </Button>
          </>
        }
      />

      <Link
        href="/googleform/forms"
        className="mt-4 inline-block text-sm text-fg-muted underline-offset-4 transition hover:text-fg hover:underline"
      >
        ← 목록
      </Link>

      {/* 메타: 문항 수 / 응답 수 */}
      {data && (
        <div
          className={cardClass({
            className:
              "mt-6 flex flex-wrap items-center justify-between gap-3 px-4 py-3",
          })}
        >
          <div className="text-sm font-medium text-fg">{data.meta.title}</div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <span className="rounded-control bg-surface-2 px-3 py-1.5">
              문항{" "}
              <span className="font-semibold text-fg">{questionCountShown}</span>
              <span className="text-fg-subtle">/{questionCountAll}</span>
            </span>

            <span className="rounded-control bg-surface-2 px-3 py-1.5">
              응답{" "}
              <span className="font-semibold text-fg">{analyzedResponses}</span>
            </span>
          </div>
        </div>
      )}

      {err && <Alert className="mt-6">{err}</Alert>}

      {/* 첫 로딩 — 사이드바/카드 자리를 미리 잡아 화면이 튀지 않게 한다 */}
      {loading && !data && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[20rem_1fr]">
          <Skeleton className="h-96 rounded-card" />

          <div className="space-y-4">
            <Skeleton className="h-56 rounded-card" />
            <Skeleton className="h-56 rounded-card" />
          </div>
        </div>
      )}

      {/* 본문 레이아웃: 좌측 네비게이션 + 우측 카드 */}
      {data && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[20rem_1fr]">
          {/*
            좌측 문항 네비게이션.
            sticky 오프셋은 공통 헤더 높이(3.5rem) + 여백만큼 띄운다.
          */}
          <aside
            className={cardClass({
              className:
                "top-[4.5rem] max-h-[calc(100dvh-7rem)] overflow-auto p-3 lg:sticky",
            })}
          >
            <div className="mb-2 px-2 text-xs font-semibold tracking-wider text-fg-subtle uppercase">
              Questions
            </div>

            <div className="space-y-1.5">
              {filteredSummaries.map((q, idx) => {
                const nt = normalizeType(q.type);
                const badge = typeBadge(nt);

                return (
                  <button
                    key={q.questionId}
                    type="button"
                    onClick={() => scrollToQuestion(q.questionId)}
                    className="group w-full rounded-control border border-transparent p-3 text-left transition hover:border-line hover:bg-surface-hover"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-fg">
                          {idx + 1}. {q.questionTitle}
                        </div>

                        <div className="mt-1 line-clamp-2 text-xs text-fg-muted">
                          {getMiniDesc(q)}
                        </div>
                      </div>

                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </div>
                  </button>
                );
              })}

              {!filteredSummaries.length && (
                <EmptyState
                  title="표시할 문항이 없습니다"
                  description="검색어나 타입 필터를 바꿔보세요."
                />
              )}
            </div>
          </aside>

          {/* 우측: 문항 카드 1열 */}
          <div className="space-y-4">
            {filteredSummaries.map((q, idx) => {
              const nt = normalizeType(q.type);
              const badge = typeBadge(nt);

              return (
                <div
                  key={q.questionId}
                  // questionId -> DOM ref 등록(사이드바 스크롤 이동용)
                  ref={(el) => {
                    cardRefs.current[q.questionId] = el;
                  }}
                  // anchor 이동 시 sticky 헤더에 가리지 않도록 여백 확보
                  className="scroll-mt-24"
                >
                  {/* 카드 상단: 번호 / 배지 / 맨 위로 */}
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="font-mono text-sm text-fg-muted">
                      Q{idx + 1}
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge tone={badge.tone}>{badge.label}</Badge>

                      <Button size="sm" onClick={scrollToTop}>
                        맨 위로 ↑
                      </Button>
                    </div>
                  </div>

                  {/* 실제 문항 카드(옵션/주관식 등 렌더링은 QuestionCard가 담당) */}
                  <QuestionCard q={q} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
