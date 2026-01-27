import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../../api/client";
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
 * - 문항 타입에 따른 UI 배지(라벨/색상 클래스)를 반환
 * - 사이드바/카드 상단에서 동일하게 재사용
 */
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
  const { formId } = useParams();

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
    } catch (e: any) {
      // 서버 에러/네트워크 에러 메시지를 최대한 사용자 친화적으로 표시
      setErr(e?.response?.data?.message || e?.message || "Failed to analyze");
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
    <div className="min-h-screen">
      {/* ✅ 최상단 앵커 */}
      <div ref={topRef} />

      {/* 전체 배경/톤: 파스텔 그라데이션 + 카드 반투명 느낌 */}
      <div className="rounded-3xl bg-gradient-to-b from-[#f6f7ff] to-[#ffffef] p-4 sm:p-6">
        {/* 상단: 페이지 타이틀 / 필터 / reload */}
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
            {/* 질문 검색 */}
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="질문 검색..."
              className="w-60 rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
            />

            {/* 타입 필터 */}
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

            {/* limit 조절 */}
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

            {/* 재조회 */}
            <button
              onClick={load}
              disabled={loading}
              className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60"
            >
              {loading ? "Loading..." : "Reload"}
            </button>
          </div>
        </div>

        {/* 메타: 설문 제목 / 문항 수 / 응답 수 */}
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

        {/* 에러 */}
        {err && (
          <div className="mb-5 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 shadow-sm">
            {err}
          </div>
        )}

        {/* 본문 레이아웃: 좌측 네비게이션 + 우측 카드 */}
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* 왼쪽: 문항 요약 네비게이션(스크롤 가능한 sticky) */}
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

          {/* 오른쪽: 문항 카드 1열 */}
          <main className="space-y-4">
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
                  // anchor 이동 시 헤더 높이만큼 여백 확보
                  className="scroll-mt-24"
                >
                  {/* 카드 상단: 번호/배지/맨 위로 */}
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

                  {/* 실제 문항 카드(옵션/주관식 등 렌더링은 QuestionCard가 담당) */}
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
