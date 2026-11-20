"use client";

import { cn } from "@/lib/cn";
import { glossaryGroup, type GlossaryGroup, type GlossaryTerm } from "@/lib/stocksim/glossary";

/** 용어 하나 — 뜻 · 계산식 · 읽는 법 */
export function TermExplain({ term, className }: { term: GlossaryTerm; className?: string }) {
  return (
    <div className={cn("space-y-1 text-xs leading-5", className)}>
      <p className="text-fg">{term.definition}</p>
      {term.formula && <p className="font-mono text-[11px] text-fg-muted">{term.formula}</p>}
      <p className="text-fg-muted">
        <span className="font-medium text-fg">읽는 법</span> {term.howToRead}
      </p>
    </div>
  );
}

/** 지표 이름 옆 ⓘ — 누르면 부모가 설명을 펼친다 */
export function InfoButton({ name, open, onToggle }: { name: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${name} 설명`}
      className={cn(
        "ml-1 inline-grid size-4 shrink-0 place-items-center rounded-full border text-[10px] leading-none align-middle transition",
        open ? "border-accent bg-accent-soft text-accent-soft-fg" : "border-line-strong text-fg-subtle hover:text-fg"
      )}
    >
      i
    </button>
  );
}

const TITLE: Record<GlossaryGroup, string> = {
  signal: "매매 신호 용어 설명",
  valuation: "투자 지표·재무 지표 용어 설명",
};

/** 탭 아래의 전체 용어 설명 (접혀 있다) */
export function GlossaryList({ group, className }: { group: GlossaryGroup; className?: string }) {
  const terms = glossaryGroup(group);

  return (
    <details className={cn("group rounded-card border border-line", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-fg">
        <span>
          {TITLE[group]} <span className="text-xs font-normal text-fg-subtle">{terms.length}개</span>
        </span>
        <span aria-hidden className="text-xs text-fg-subtle transition group-open:rotate-180">
          ▼
        </span>
      </summary>
      <dl className="grid gap-x-6 border-t border-line md:grid-cols-2">
        {terms.map((t) => (
          <div key={t.term} className="border-b border-line/60 px-3 py-2.5">
            <dt className="mb-1 text-sm font-semibold text-fg">{t.term}</dt>
            <dd>
              <TermExplain term={t} />
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
