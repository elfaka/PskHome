"use client";

import { useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { airportLabel, filterAirports, toAirportCode, type Airport } from "./airports";

/**
 * 공항 드롭다운 (콤보박스).
 *
 * - 누르면 목록 전체가 **주어진 순서(인기 순)** 로 펼쳐진다. 위에 순위 번호를 붙인다.
 * - 글자를 치면 코드·도시·공항 이름·나라로 걸러진다 (순서는 인기 순 그대로).
 * - 목록에 없는 공항은 IATA 코드 3자리를 치면 "직접 입력" 항목으로 고를 수 있다.
 * - ↑/↓ 로 이동, Enter 로 선택, Esc 로 닫기. 포커스를 잃으면 친 글자가 공항으로 해석될 때만 반영한다.
 */
export default function AirportSelect({
  id,
  value,
  onChange,
  airports,
  exclude,
  placeholder,
}: {
  id: string;
  /** 선택된 IATA 코드 (없으면 "") */
  value: string;
  onChange: (code: string) => void;
  /** 드롭다운 순서 그대로 */
  airports: Airport[];
  /** 목록에서 뺄 코드 (반대편에서 고른 공항) */
  exclude?: string;
  placeholder?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  /** 입력 중인 글자. null 이면 선택된 공항 이름을 보여준다 */
  const [text, setText] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const ranked = useMemo(() => airports.filter((a) => a.code !== exclude), [airports, exclude]);
  const rankOf = useMemo(() => new Map(ranked.map((a, i) => [a.code, i + 1])), [ranked]);

  const query = text ?? "";
  const matches = filterAirports(ranked, query);
  // 목록에 없는 코드를 친 경우 "직접 입력" 항목을 맨 아래에 둔다
  const typedCode = /^[A-Za-z]{3}$/.test(query.trim()) ? query.trim().toUpperCase() : null;
  const custom = typedCode && !matches.some((a) => a.code === typedCode) && typedCode !== exclude ? typedCode : null;
  const items: { code: string; airport?: Airport }[] = [
    ...matches.map((a) => ({ code: a.code, airport: a })),
    ...(custom ? [{ code: custom }] : []),
  ];

  const display = text ?? (value ? airportLabel(value) : "");

  const openList = () => {
    setOpen(true);
    // 펼칠 때는 선택된 공항에 커서를 둔다 (없으면 1위)
    const selected = items.findIndex((i) => i.code === value);
    setActive(selected >= 0 ? selected : 0);
  };

  const close = () => {
    setOpen(false);
    setText(null);
  };

  const pick = (code: string) => {
    onChange(code);
    close();
  };

  /** 포커스를 잃을 때: 친 글자가 공항으로 해석되면 반영, 아니면 원래 선택으로 되돌린다 */
  const commitTyped = () => {
    if (text != null && text.trim() !== "") {
      const code = toAirportCode(text);
      if (code && code !== exclude) onChange(code);
    }
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      if (items.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + items.length) % items.length);
    } else if (e.key === "Enter") {
      if (open && items[active]) {
        e.preventDefault();
        pick(items[active].code);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      }
    }
  };

  const activeId = open && items[active] ? `${listId}-${items[active].code}` : undefined;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        value={display}
        placeholder={placeholder}
        onFocus={(e) => {
          e.currentTarget.select();
          openList();
        }}
        onClick={() => !open && openList()}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onBlur={commitTyped}
        onKeyDown={onKeyDown}
        className={cn(
          "h-10 w-full rounded-control border border-line bg-surface pr-9 pl-3 text-sm text-fg transition",
          "placeholder:text-fg-subtle hover:border-line-strong"
        )}
      />

      {/* 펼침 표시 — 눌러도 목록이 열린다 */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="목록 열기"
        // 입력칸 포커스를 뺏지 않도록 mousedown 에서 막는다
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) close();
          else inputRef.current?.focus();
        }}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-fg-subtle hover:text-fg"
      >
        <span aria-hidden className={cn("text-xs transition", open && "rotate-180")}>
          ▼
        </span>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${placeholder ?? "공항"} 목록`}
          className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-card border border-line bg-surface p-1 shadow-overlay"
        >
          {items.length === 0 && <li className="px-3 py-2 text-sm text-fg-muted">맞는 공항이 없습니다. IATA 코드 3자리를 입력하세요.</li>}

          {items.map((item, i) => {
            const selected = item.code === value;
            return (
              <li
                key={item.code}
                id={`${listId}-${item.code}`}
                role="option"
                aria-selected={selected}
                // 입력칸 blur 보다 먼저 고르도록 mousedown 에서 처리한다
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item.code);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-control px-2.5 py-2 text-sm",
                  i === active ? "bg-surface-hover" : "",
                  selected && "font-semibold"
                )}
              >
                {item.airport ? (
                  <>
                    <span className="w-5 shrink-0 text-right text-xs text-fg-subtle tabular-nums">
                      {rankOf.get(item.code)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-fg">
                      {item.airport.city} <span className="text-fg-muted">{item.airport.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-fg-subtle">{item.airport.country}</span>
                    <span className="w-9 shrink-0 font-mono text-xs text-fg-muted">{item.code}</span>
                  </>
                ) : (
                  <span className="text-fg">
                    <span className="font-mono">{item.code}</span> <span className="text-fg-muted">직접 입력</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
