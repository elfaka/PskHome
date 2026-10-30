"use client";

import { getTrades } from "@/api/stockSim";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { changeTone, formatClock, formatNumber, TONE_TEXT } from "@/lib/stocksim/format";
import { usePolling } from "@/lib/stocksim/usePolling";

const REFRESH_MS = 3_000;

/** 당일 최근 체결 (최신순). 가격은 전일 종가 대비로 색을 칠한다. */
export default function TradesPanel({ symbol, prevClose }: { symbol: string; prevClose: number | null }) {
  const { data: ticks, error } = usePolling(symbol, () => getTrades(symbol), REFRESH_MS, "체결 내역을 불러오지 못했습니다.");

  return (
    <section aria-label="체결" className="flex min-h-0 flex-col">
      <div className="border-b border-line px-3 py-2">
        <h2 className="text-sm font-semibold text-fg">체결</h2>
      </div>

      {error && !ticks && <p className="px-3 py-4 text-center text-sm text-danger-soft-fg">{error}</p>}
      {!ticks && !error && <Skeleton className="m-3 h-40" />}
      {ticks && ticks.length === 0 && <p className="px-3 py-4 text-center text-sm text-fg-subtle">오늘 체결이 없습니다.</p>}

      {ticks && ticks.length > 0 && (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 bg-surface text-fg-subtle">
              <tr>
                <th className="px-3 py-1.5 text-left font-normal">시각</th>
                <th className="px-3 py-1.5 text-right font-normal">체결가</th>
                <th className="px-3 py-1.5 text-right font-normal">수량</th>
              </tr>
            </thead>
            <tbody>
              {ticks.map((t, i) => (
                <tr key={`${t.time}-${i}`} className="border-t border-line/60">
                  <td className="px-3 py-1 text-fg-muted">{formatClock(t.time)}</td>
                  <td className={cn("px-3 py-1 text-right font-medium", prevClose ? TONE_TEXT[changeTone(t.price - prevClose)] : "text-fg")}>
                    {formatNumber(t.price)}
                  </td>
                  <td className="px-3 py-1 text-right text-fg">{formatNumber(t.volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
