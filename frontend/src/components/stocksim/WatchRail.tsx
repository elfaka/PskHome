"use client";

import { useState } from "react";

import type { Holding, QuoteWithChange } from "@/api/stockSim";
import { cn } from "@/lib/cn";
import { changeTone, formatNumber, formatRate, TONE_TEXT } from "@/lib/stocksim/format";
import type { WatchItem } from "@/lib/stocksim/watchlist";

type RailItem = { symbol: string; name: string };

/**
 * 관심종목·보유종목 목록 (증권사 화면 왼쪽 목록).
 *
 * - vertical: 넓은 화면의 왼쪽 열. 관심/보유 탭.
 * - horizontal: 좁은 화면의 가로 스크롤 칩. 관심종목 + 보유종목을 합쳐 보여준다.
 */
export default function WatchRail({
  layout,
  watchlist,
  holdings,
  quotes,
  selectedSymbol,
  onSelect,
}: {
  layout: "vertical" | "horizontal";
  watchlist: WatchItem[];
  holdings: Holding[];
  quotes: Map<string, QuoteWithChange>;
  selectedSymbol: string;
  onSelect: (item: RailItem) => void;
}) {
  const [tab, setTab] = useState<"watch" | "holding">("watch");

  const priceOf = (symbol: string) => {
    const q = quotes.get(symbol);
    return q ? { price: q.price, rate: q.changeRate, tone: TONE_TEXT[changeTone(q.change)] } : null;
  };

  if (layout === "horizontal") {
    const items: RailItem[] = [...watchlist];
    for (const h of holdings) if (!items.some((i) => i.symbol === h.symbol)) items.push(h);

    return (
      <nav aria-label="관심종목" className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-1 sm:-mx-3 sm:px-3">
        {items.map((item) => {
          const p = priceOf(item.symbol);
          return (
            <button
              key={item.symbol}
              type="button"
              onClick={() => onSelect(item)}
              aria-current={item.symbol === selectedSymbol ? "true" : undefined}
              className={cn(
                "flex shrink-0 flex-col items-start rounded-card border px-3 py-1.5 text-left transition",
                item.symbol === selectedSymbol ? "border-accent bg-accent-soft/60" : "border-line bg-surface hover:border-line-strong"
              )}
            >
              <span className="text-xs font-medium text-fg">{item.name}</span>
              <span className={cn("text-[11px] tabular-nums", p?.tone ?? "text-fg-subtle")}>
                {p ? `${formatNumber(p.price)} ${p.rate == null ? "" : formatRate(p.rate)}` : "-"}
              </span>
            </button>
          );
        })}
      </nav>
    );
  }

  const list: (RailItem & { sub?: string })[] =
    tab === "watch"
      ? watchlist
      : holdings.map((h) => ({ symbol: h.symbol, name: h.name, sub: `${formatNumber(h.quantity)}주` }));

  return (
    <nav aria-label="종목 목록" className="flex min-h-0 flex-col">
      <div role="tablist" className="grid grid-cols-2 border-b border-line text-sm">
        {(
          [
            ["watch", `관심 ${watchlist.length}`],
            ["holding", `보유 ${holdings.length}`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "border-b-2 py-2 font-medium transition",
              tab === value ? "border-fg text-fg" : "border-transparent text-fg-muted hover:text-fg"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-fg-subtle">
          {tab === "watch" ? "종목 이름 옆 ☆ 를 눌러 관심종목을 추가하세요." : "보유 종목이 없습니다."}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto">
          {list.map((item) => {
            const p = priceOf(item.symbol);
            return (
              <li key={item.symbol}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  aria-current={item.symbol === selectedSymbol ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 border-b border-line/60 px-3 py-2 text-left transition",
                    item.symbol === selectedSymbol ? "bg-surface-2" : "hover:bg-surface-hover"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{item.name}</span>
                    <span className="block font-mono text-[11px] text-fg-subtle">{item.sub ?? item.symbol}</span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className={cn("block text-sm font-medium", p?.tone ?? "text-fg-subtle")}>
                      {p ? formatNumber(p.price) : "-"}
                    </span>
                    <span className={cn("block text-[11px]", p?.tone ?? "text-fg-subtle")}>
                      {p?.rate == null ? "" : formatRate(p.rate)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
