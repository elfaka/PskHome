import { useMemo, useState } from "react";

/**
 * 설문 정의 기준 보기 메타
 * - label: 보기 라벨
 * - order: 설문에서 설정한 보기 순서 (있으면 UI 정렬이 안정적)
 */
type AllOpt = {
  label: string;
  order?: number | null;
  value?: string | null;
  score?: number | null;
};

/**
 * 분석 집계 결과(응답이 실제 존재한 보기들의 통계)
 * - label: 보기 라벨
 * - count: 선택 횟수
 * - rate : 선택 비율(%)  ※ 문항 응답자 기준 분모
 */
type StatOpt = { label: string; count: number; rate: number };

/**
 * mergeAllOptions
 *
 * [역할]
 * - allOptions(설문 정의 보기 목록)와 options(실제 집계 결과)을 합쳐
 *   "표시용 옵션 리스트"를 만든다.
 *
 * [왜 필요한가?]
 * - 백엔드 집계가 "응답이 있는 보기만" 내려주는 정책일 경우,
 *   0 응답 보기까지 UI에 표시하려면 프론트에서 merge가 필요하다.
 *
 * [정렬 규칙]
 * - order가 있으면 order 오름차순
 * - order가 없으면 label 기준(문자열) 정렬
 *
 * [예외 처리]
 * - allOptions가 비어있으면(stats만 있는 경우) stats 그대로 표시한다.
 */
function mergeAllOptions(allOptions: AllOpt[] | undefined, stats: StatOpt[] | undefined) {
  const all = allOptions ?? [];

  // label 기준으로 집계 결과를 빠르게 찾기 위한 Map
  const map = new Map((stats ?? []).map((s) => [s.label, s]));

  // allOptions 기준으로 0 응답 보기까지 채운 merged 리스트 생성
  const merged = all.map((o) => {
    const hit = map.get(o.label);
    return {
      label: o.label,
      order: o.order ?? null,
      count: hit?.count ?? 0,
      rate: hit?.rate ?? 0,
    };
  });

  // allOptions가 없고 stats만 온 경우(예: 백엔드가 allOptions를 안 내려준 상황)
  if (!merged.length && (stats ?? []).length) {
    return (stats ?? []).map((s) => ({
      label: s.label,
      order: null,
      count: s.count,
      rate: s.rate,
    }));
  }

  // 설문 정의 순서(order) 기반 정렬 (order가 없는 경우 label 정렬)
  merged.sort((a, b) => {
    const ao = a.order ?? 999999;
    const bo = b.order ?? 999999;
    if (ao !== bo) return ao - bo;
    return String(a.label).localeCompare(String(b.label), "ko");
  });

  return merged;
}

/**
 * ChoiceRenderer
 *
 * [역할]
 * - 객관식(단일/복수) 문항의 보기별 결과를 카드형 리스트로 렌더링
 *
 * [UX 포인트]
 * - 보기가 많을 수 있으므로 initialShow까지만 보여주고 "더보기/접기" 제공
 * - rate를 막대 그래프로 시각화하여 빠르게 분포를 파악 가능
 */
export default function ChoiceRenderer({
  allOptions,
  options,
  initialShow = 12,
}: {
  allOptions?: AllOpt[];
  options: StatOpt[];
  initialShow?: number;
}) {
  // "더보기/접기" 토글 상태
  const [expanded, setExpanded] = useState(false);

  /**
   * allOptions + options merge 결과
   * - 입력이 바뀔 때만 재계산(useMemo)
   */
  const merged = useMemo(() => mergeAllOptions(allOptions, options), [allOptions, options]);

  // 확장 여부에 따라 보여줄 항목 수 결정
  const visible = expanded ? merged : merged.slice(0, initialShow);

  // 더보기 버튼 표시 여부
  const hasMore = merged.length > initialShow;

  // 표시할 데이터가 없을 때(예: 응답/보기 모두 없는 경우)
  if (!merged.length) return <div className="text-sm text-zinc-500">집계 결과 없음</div>;

  return (
    <div className="space-y-3">
      {/* 보기 리스트 */}
      <ul className="space-y-2">
        {visible.map((o) => (
          <li
            key={o.label}
            className="rounded-2xl border border-zinc-200/70 bg-white/70 p-3 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              {/* 왼쪽: 라벨 + 막대 */}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-extrabold text-zinc-900">{o.label}</div>

                {/* 비율 막대: 0~100 범위로 clamp */}
                <div className="mt-2 h-2 w-full rounded-full bg-zinc-100">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                    style={{ width: `${Math.min(100, Math.max(0, o.rate))}%` }}
                  />
                </div>
              </div>

              {/* 오른쪽: 수치 */}
              <div className="shrink-0 text-right text-xs text-zinc-600">
                <div className="font-extrabold text-zinc-900">{o.rate}%</div>
                <div>{o.count}명</div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* 더보기/접기 */}
      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2 text-xs font-extrabold text-zinc-800 shadow-sm hover:bg-white"
        >
          {expanded ? "접기" : `더보기 (${merged.length - initialShow}개)`}
        </button>
      )}
    </div>
  );
}
