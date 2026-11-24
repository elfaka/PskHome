"use client";

import { useState } from "react";

import { getInvestorRankings, type InvestorRankingItem, type RankingInvestor } from "@/api/stockSim";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { changeTone, formatKrwCompact, formatRate, formatShortTime, formatWon, TONE_TEXT } from "@/lib/stocksim/format";
import { usePolling } from "@/lib/stocksim/usePolling";

/** 백엔드가 5분 캐시한다 */
const REFRESH_MS = 5 * 60_000;

const INVESTORS: { value: RankingInvestor; label: string }[] = [
  { value: "foreigner", label: "외국인" },
  { value: "institution", label: "기관" },
  { value: "individual", label: "개인" },
];

function RankList({
  title,
  items,
  tone,
  onSelect,
}: {
  title: string;
  items: InvestorRankingItem[];
  tone: "up" | "down";
  onSelect: (stock: { symbol: string; name: string }) => void;
}) {
  return (
    <section aria-label={title} className="min-w-0">
      <h3 className={cn("mb-1 text-xs font-semibold", TONE_TEXT[tone])}>{title}</h3>
      {items.length === 0 ? (
        <p className="rounded-card border border-line px-3 py-4 text-center text-xs text-fg-subtle">데이터가 없습니다.</p>
      ) : (
        <ol className="divide-y divide-line/60 rounded-card border border-line">
          {items.map((r) => (
            <li key={r.symbol}>
              <button
                type="button"
                onClick={() => onSelect({ symbol: r.symbol, name: r.name ?? r.symbol })}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-surface-hover"
              >
                <span className="w-5 shrink-0 text-right tabular-nums text-fg-subtle">{r.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">{r.name ?? r.symbol}</span>
                  <span className="block truncate tabular-nums text-[11px] text-fg-subtle">
                    {r.price != null ? formatWon(r.price) : r.symbol}
                    {r.changeRate != null && (
                      <span className={cn("ml-1", TONE_TEXT[changeTone(r.changeRate)])}>{formatRate(r.changeRate)}</span>
                    )}
                  </span>
                </span>
                <span className={cn("shrink-0 tabular-nums font-semibold", TONE_TEXT[tone])}>
                  {tone === "up" ? "+" : "-"}
                  {formatKrwCompact(r.amount)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** 외국인·기관·개인이 오늘 많이 순매수·순매도한 종목 (거래대금 순) */
export default function InvestorRankingPanel({ onSelect }: { onSelect: (stock: { symbol: string; name: string }) => void }) {
  const [investor, setInvestor] = useState<RankingInvestor>("foreigner");
  const { data, error } = usePolling(investor, () => getInvestorRankings(investor), REFRESH_MS, "순위를 불러오지 못했습니다.");
  const label = INVESTORS.find((i) => i.value === investor)!.label;

  return (
    <div className="space-y-3 p-3">
      <div role="tablist" aria-label="투자자" className="grid grid-cols-3 rounded-card border border-line bg-surface-2 p-1">
        {INVESTORS.map((i) => (
          <button
            key={i.value}
            type="button"
            role="tab"
            aria-selected={investor === i.value}
            onClick={() => setInvestor(i.value)}
            className={cn(
              "rounded-control py-1 text-xs font-medium",
              investor === i.value ? "bg-fg text-bg" : "text-fg-muted hover:bg-surface-hover hover:text-fg"
            )}
          >
            {i.label}
          </button>
        ))}
      </div>

      {error && !data ? (
        <p role="alert" className="py-6 text-center text-sm text-danger-soft-fg">
          {error}
        </p>
      ) : !data ? (
        <Skeleton className="h-60" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <RankList title={`${label} 순매수 상위`} items={data.netBuy} tone="up" onSelect={onSelect} />
            <RankList title={`${label} 순매도 상위`} items={data.netSell} tone="down" onSelect={onSelect} />
          </div>
          <p className="text-[11px] text-fg-subtle">
            {data.rankedAt ? `${formatShortTime(data.rankedAt)} 기준` : "순위 데이터가 없습니다"} · 순매수(순매도) 거래대금 순 · KRX·NXT 통합.
            {investor === "individual"
              ? " 개인은 장 마감 후 확정되어, 장중에는 직전 영업일 기준입니다."
              : " 장중에는 잠정치입니다."}{" "}
            종목을 누르면 그 종목의 수급을 봅니다.
          </p>
        </>
      )}
    </div>
  );
}
