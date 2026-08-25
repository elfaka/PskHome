"use client";

import { useMemo, useState } from "react";

import { buttonClass } from "@/components/ui/Button";

import OptionRow from "./OptionRow";

/**
 * 설문 정의 보기 메타
 * - order/score를 활용하면 척도 정렬과 통계가 안정적
 */
type AllOpt = {
  label: string;
  order?: number | null;
  value?: string | null;
  score?: number | null;
};

/**
 * 분석 집계 결과(응답이 실제 존재했던 보기들의 통계)
 */
type StatOpt = { label: string; count: number; rate: number };

/**
 * extractNumeric
 *
 * [역할]
 * - 라벨 문자열에서 숫자(정수/소수)를 하나 추출해 number로 반환한다.
 *
 * [왜 필요한가?]
 * - SCALE 옵션 라벨이 "1 (매우 불만족)", "10 (매우 만족)"처럼
 *   숫자 + 텍스트 형태로 내려올 수 있다.
 * - score 필드가 없을 때도 통계/정렬을 하기 위해 라벨에서 숫자 추출을 시도한다.
 */
function extractNumeric(label: string): number | null {
  const m = String(label).match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * mergeAllOptions
 *
 * [역할]
 * - allOptions(설문 정의 보기 목록) + stats(집계 결과)를 merge해
 *   표시용 옵션 리스트를 생성한다.
 *
 * [핵심 포인트]
 * - 0 응답 보기까지 포함 가능 (allOptions 기준으로 count/rate 기본값 0)
 * - 정렬은 "설문 정의 순서(order)"가 우선 (없으면 score/label 기반)
 *
 * [정렬 규칙]
 * 1) order 오름차순 (설문 정의 순서)
 * 2) score 오름차순 (척도 점수)
 * 3) label 문자열 정렬 (fallback)
 *
 * [예외 처리]
 * - allOptions가 없고 stats만 있는 경우(백엔드가 allOptions를 내려주지 않는 상황)
 *   stats만 기반으로 표시 리스트를 만든다.
 */
function mergeAllOptions(allOptions: AllOpt[] | undefined, stats: StatOpt[] | undefined) {
  const all = allOptions ?? [];

  // label 기준 집계 결과 조회 Map
  const map = new Map((stats ?? []).map((s) => [s.label, s]));

  // allOptions 기준으로 0 응답까지 채운 리스트 생성
  const merged = all.map((o) => {
    const hit = map.get(o.label);
    return {
      label: o.label,
      order: o.order ?? null,
      // score가 없으면 라벨에서 숫자 추출로 보완
      score: o.score ?? extractNumeric(o.label),
      count: hit?.count ?? 0,
      rate: hit?.rate ?? 0,
    };
  });

  // allOptions가 비어있고 stats만 있는 경우 (fallback)
  if (!merged.length && (stats ?? []).length) {
    return (stats ?? []).map((s) => ({
      label: s.label,
      order: null,
      score: extractNumeric(s.label),
      count: s.count,
      rate: s.rate,
    }));
  }

  // ✅ 척도 오름차순 정렬(설문 설정 기준 우선)
  merged.sort((a, b) => {
    const ao = a.order ?? 999999;
    const bo = b.order ?? 999999;
    if (ao !== bo) return ao - bo;

    const as = a.score;
    const bs = b.score;
    if (as !== null && bs !== null && as !== bs) return as - bs;

    return String(a.label).localeCompare(String(b.label), "ko");
  });

  return merged;
}

/**
 * ScaleRenderer
 *
 * [역할]
 * - SCALE(척도형) 문항의 집계 결과를 카드 리스트로 렌더링
 * - score 기반으로 가중 평균/표준편차(통계)를 계산해서 상단에 표시
 * - 옵션이 많을 경우 더보기/접기 제공
 */
export default function ScaleRenderer({
  allOptions,
  options,
  initialShow = 12,
}: {
  allOptions?: AllOpt[];
  options: StatOpt[];
  initialShow?: number;
}) {
  // "더보기/접기" 상태
  const [expanded, setExpanded] = useState(false);

  /**
   * 표시용 옵션 리스트(0 응답 포함 + 정렬)
   * - 입력값이 바뀔 때만 재계산(useMemo)
   */
  const merged = useMemo(() => mergeAllOptions(allOptions, options), [allOptions, options]);

  // 확장 여부에 따라 보여줄 항목 수 결정
  const visible = expanded ? merged : merged.slice(0, initialShow);

  // 더보기 버튼 표시 여부
  const hasMore = merged.length > initialShow;

  /**
   * 척도 통계(가중 평균/가중 표준편차)
   *
   * - score가 있는 항목만 대상으로 계산
   * - count를 가중치(weight)로 사용
   *
   * mean = Σ(score * count) / Σ(count)
   * variance = Σ(score^2 * count) / Σ(count) - mean^2
   * std = sqrt(variance)
   */
  const stats = useMemo(() => {
    let total = 0;
    let sum = 0;
    let sumSq = 0;

    for (const o of merged) {
      if (o.score === null) continue;
      const c = Number(o.count) || 0;
      total += c;
      sum += o.score * c;
      sumSq += o.score * o.score * c;
    }

    // 응답이 0이면 통계 없음
    if (total <= 0) return null;

    const mean = sum / total;
    const variance = sumSq / total - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));

    return { n: total, mean, std };
  }, [merged]);

  if (!merged.length)
    return <div className="text-sm text-fg-subtle">집계 결과 없음</div>;

  return (
    <div className="space-y-3">
      {/* 통계 요약 영역 */}
      {stats && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-line bg-surface px-3 py-2 text-xs text-fg-muted">
          <span className="font-semibold text-fg">척도 통계</span>
          <span aria-hidden className="text-line-strong">
            |
          </span>
          <span className="font-mono">n={stats.n}</span>
          <span aria-hidden className="text-line-strong">
            |
          </span>
          <span>
            평균 <span className="font-mono text-fg">{stats.mean.toFixed(2)}</span>
          </span>
          <span aria-hidden className="text-line-strong">
            |
          </span>
          <span>
            표준편차{" "}
            <span className="font-mono text-fg">{stats.std.toFixed(2)}</span>
          </span>
        </div>
      )}

      {/* 보기 리스트 */}
      <ul className="space-y-2">
        {visible.map((o) => (
          <OptionRow
            key={o.label}
            label={o.label}
            rate={o.rate}
            count={o.count}
          />
        ))}
      </ul>

      {/* 더보기/접기 */}
      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className={buttonClass({ size: "sm", full: true })}
        >
          {expanded ? "접기" : `더보기 (${merged.length - initialShow}개)`}
        </button>
      )}
    </div>
  );
}
