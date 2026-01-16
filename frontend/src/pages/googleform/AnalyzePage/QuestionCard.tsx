
import ChoiceRenderer from "./renderers/ChoiceRenderer";
import ScaleRenderer from "./renderers/ScaleRenderer";
import TextRenderer from "./renderers/TextRenderer";

type AllOpt = { label: string; order?: number | null; value?: string | null; score?: number | null };
type StatOpt = { label: string; count: number; rate: number };

type Summary = {
  questionId: string;
  questionTitle: string;
  type: string;
  allOptions?: AllOpt[];
  options: StatOpt[];
  text?: { count: number; samples: string[] } | null;
};

function normalizeType(t: string) {
  const x = (t || "").toUpperCase();
  if (x.includes("TEXT")) return "TEXT";
  if (x.includes("SCALE")) return "SCALE";
  if (x.includes("UNKNOWN")) return "SCALE";
  if (x.includes("CHOICE")) return "CHOICE";
  return x || "UNKNOWN";
}

export default function QuestionCard({ q }: { q: Summary }) {
  const t = normalizeType(q.type);

  return (
    <div className="rounded-3xl border border-zinc-200/70 bg-white/80 shadow-sm backdrop-blur">
      {/* 헤더 */}
      <div className="border-b border-zinc-200/50 px-5 py-4">
        <div className="text-base font-black text-zinc-900 leading-snug">
          {q.questionTitle}
        </div>
        <div className="mt-1 text-xs font-semibold text-zinc-500">{q.type}</div>
      </div>

      {/* 카드 전체 스크롤 */}
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
