import ChoiceRenderer from "./renderers/ChoiceRenderer";
import ScaleRenderer from "./renderers/ScaleRenderer";
import TextRenderer from "./renderers/TextRenderer";

/**
 * allOptions:
 * - 설문 정의 기준 보기 목록(있으면 0응답 보기 표시/정렬 안정화 가능)
 * - label: 보기 라벨
 * - order: 설문에 설정된 보기 순서
 * - score: scale(척도) 점수값(있으면 정렬/통계에 활용)
 */
type AllOpt = {
  label: string;
  order?: number | null;
  value?: string | null;
  score?: number | null;
};

/**
 * options:
 * - 분석 집계 결과(응답이 실제 존재하는 보기들의 count/rate)
 */
type StatOpt = { label: string; count: number; rate: number };

/**
 * AnalyzeResultDto.QuestionSummary에 대응하는 프론트 타입
 * - type에 따라 options 또는 text가 의미를 가짐
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
 * normalizeType
 *
 * [역할]
 * - 백엔드 type 문자열이 바뀌거나 확장되더라도
 *   프론트 렌더링 분기(텍스트/척도/객관식)가 흔들리지 않도록 정규화한다.
 *
 * [정책]
 * - UNKNOWN도 실제로는 선형 배율처럼 취급하는 케이스가 많아 SCALE로 처리
 *   (필요하면 나중에 UNKNOWN 전용 렌더러를 추가할 수도 있음)
 */
function normalizeType(t: string) {
  const x = (t || "").toUpperCase();
  if (x.includes("TEXT")) return "TEXT";
  if (x.includes("SCALE")) return "SCALE";
  if (x.includes("UNKNOWN")) return "SCALE";
  if (x.includes("CHOICE")) return "CHOICE";
  return x || "UNKNOWN";
}

/**
 * QuestionCard
 *
 * [역할]
 * - 분석 페이지에서 문항 1개를 카드 UI로 렌더링하는 공통 컴포넌트
 *
 * [구성]
 * - Header: 문항 제목 + 원본 타입 표시
 * - Body  : 문항 타입에 따라 Renderer 선택
 *
 * [UX 포인트]
 * - 문항/보기 내용이 길어도 페이지 전체 레이아웃이 무너지는 것을 방지하기 위해
 *   카드 높이를 제한(max-h)하고, 카드 전체 스크롤을 적용했다.
 */
export default function QuestionCard({ q }: { q: Summary }) {
  // 문항 타입을 정규화하여 렌더러 선택
  const t = normalizeType(q.type);

  return (
    <div className="rounded-3xl border border-zinc-200/70 bg-white/80 shadow-sm backdrop-blur">
      {/* ======================================================
         카드 헤더: 문항 제목 + 타입 라벨
      ====================================================== */}
      <div className="border-b border-zinc-200/50 px-5 py-4">
        <div className="text-base font-black text-zinc-900 leading-snug">
          {q.questionTitle}
        </div>
        {/* type은 디버깅/분류 확인을 위해 원본 그대로 표시 */}
        <div className="mt-1 text-xs font-semibold text-zinc-500">{q.type}</div>
      </div>

      {/* ======================================================
         카드 바디: "카드 전체 스크롤"로 UX 안정화
         - TEXT: 주관식 렌더러
         - SCALE: 척도 렌더러 (UNKNOWN 포함)
         - 그 외: 객관식 렌더러
      ====================================================== */}
      <div className="max-h-[460px] overflow-auto px-5 py-5">
        {t === "TEXT" ? (
          <TextRenderer text={q.text} />
        ) : t === "SCALE" ? (
          <ScaleRenderer allOptions={q.allOptions} options={q.options} />
        ) : (
          <ChoiceRenderer allOptions={q.allOptions} options={q.options} />
        )}
      </div>
    </div>
  );
}
/*
“문항 타입을 정규화(normalizeType)해서 UI 분기 안정성을 확보했다”

“카드 전체 스크롤을 적용해 긴 문항/보기에도 레이아웃이 무너지지 않게 했다”

“Renderer를 분리해 타입별 UI를 독립적으로 개선 가능한 구조로 만들었다”
 */