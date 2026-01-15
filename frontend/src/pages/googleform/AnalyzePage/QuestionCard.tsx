
import ChoiceRenderer from "./renderers/ChoiceRenderer";
import TextRenderer from "./renderers/TextRenderer";
import ScaleRenderer from "./renderers/ScaleRenderer";

type Summary = {
  questionId: string;
  questionTitle: string;
  type: string;
  options: Array<{ label: string; count: number; rate: number; score?: number | string; value?: number | string }>;
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
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 px-4 py-3">
        <div className="text-sm font-extrabold text-zinc-900 leading-snug">
          {q.questionTitle}
        </div>
        <div className="mt-1 text-xs text-zinc-500">{q.type}</div>
      </div>

      <div className="max-h-[420px] overflow-auto px-4 py-4">
        {t === "TEXT" ? (
          <TextRenderer text={q.text} />
        ) : t === "SCALE" ? (
          <ScaleRenderer options={q.options} />
        ) : (
          <ChoiceRenderer options={q.options} />
        )}
      </div>
    </div>
  );
}
