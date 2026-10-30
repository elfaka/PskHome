"use client";

import { getInvestorFlows, type InvestorFlowDay } from "@/api/stockSim";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { changeTone, formatPercent, formatShares, TONE_TEXT } from "@/lib/stocksim/format";
import { usePolling } from "@/lib/stocksim/usePolling";

/** 일별 데이터라 자주 받을 필요가 없다 (백엔드도 10분 캐시). */
const REFRESH_MS = 10 * 60_000;

const signed = (v: number | null) => (v == null ? "-" : `${v > 0 ? "+" : ""}${formatShares(v)}`);

/** 투자자별 순매수(주)·외국인 보유율·공매도 비중 — 최근 20거래일 */
export default function InvestorFlowPanel({ symbol }: { symbol: string }) {
  const { data: days, error } = usePolling(symbol, () => getInvestorFlows(symbol), REFRESH_MS, "투자자 동향을 불러오지 못했습니다.");

  if (error && !days) {
    return (
      <p role="alert" className="p-6 text-center text-sm text-danger-soft-fg">
        {error}
      </p>
    );
  }
  if (!days) return <Skeleton className="m-3 h-60" />;
  if (days.length === 0) return <p className="p-6 text-center text-sm text-fg-subtle">투자자별 매매동향 데이터가 없습니다.</p>;

  const sum = (pick: (d: InvestorFlowDay) => number | null) => days.reduce((s, d) => s + (pick(d) ?? 0), 0);
  const totals = [
    { label: "개인", value: sum((d) => d.individual) },
    { label: "외국인", value: sum((d) => d.foreigner) },
    { label: "기관", value: sum((d) => d.institution) },
  ];

  return (
    <div className="space-y-3 p-3">
      <dl className="grid grid-cols-3 gap-2">
        {totals.map((t) => (
          <div key={t.label} className="rounded-card border border-line bg-surface-2 px-3 py-2">
            <dt className="text-xs text-fg-subtle">{t.label} {days.length}일 누적</dt>
            <dd className={cn("text-base font-semibold tabular-nums", TONE_TEXT[changeTone(t.value)])}>{signed(t.value)}</dd>
          </div>
        ))}
      </dl>

      <div className="max-h-96 overflow-auto rounded-card border border-line">
        <table className="w-full min-w-[34rem] text-xs tabular-nums">
          <thead className="sticky top-0 bg-surface text-fg-subtle">
            <tr className="border-b border-line">
              <th className="px-3 py-2 text-left font-normal">일자</th>
              <th className="px-3 py-2 text-right font-normal">개인</th>
              <th className="px-3 py-2 text-right font-normal">외국인</th>
              <th className="px-3 py-2 text-right font-normal">기관</th>
              <th className="px-3 py-2 text-right font-normal">외국인 보유율</th>
              <th className="px-3 py-2 text-right font-normal">공매도 비중</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date} className="border-b border-line/60 last:border-0">
                <td className="px-3 py-1.5 text-fg-muted">{d.date}</td>
                {[d.individual, d.foreigner, d.institution].map((v, i) => (
                  <td key={i} className={cn("px-3 py-1.5 text-right", v == null ? "text-fg-subtle" : TONE_TEXT[changeTone(v)])}>
                    {signed(v)}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right text-fg">{d.foreignerHoldingRate == null ? "-" : formatPercent(d.foreignerHoldingRate)}</td>
                <td className="px-3 py-1.5 text-right text-fg">{d.shortSellingRate == null ? "-" : formatPercent(d.shortSellingRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-fg-subtle">순매수 거래량(주) 기준. 당일 잠정치에는 개인·기타법인 값이 없습니다.</p>
    </div>
  );
}
