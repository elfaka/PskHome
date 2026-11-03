import type { FinancialYear, StockOverview } from "@/api/stockSim";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { changeTone, formatKrwCompact, formatNumber, formatPercent, formatRate, TONE_TEXT } from "@/lib/stocksim/format";

type Row = {
  label: string;
  value: (y: FinancialYear) => string;
  /** 전년 대비 증감률 (있으면 값 아래에 작게) */
  growth?: (y: FinancialYear) => number | null;
};

const won = (v: number | null) => (v == null ? "-" : `${formatKrwCompact(v)}원`);
const pct = (v: number | null) => (v == null ? "-" : formatPercent(v, 1));
const perShare = (v: number | null) => (v == null ? "-" : `${formatNumber(v)}원`);

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "손익",
    rows: [
      { label: "매출액", value: (y) => won(y.revenue), growth: (y) => y.revenueGrowth },
      { label: "영업이익", value: (y) => won(y.operatingIncome), growth: (y) => y.operatingIncomeGrowth },
      { label: "당기순이익", value: (y) => won(y.netIncome), growth: (y) => y.netIncomeGrowth },
    ],
  },
  {
    title: "재무상태",
    rows: [
      { label: "자산총계", value: (y) => won(y.totalAssets) },
      { label: "부채총계", value: (y) => won(y.totalLiabilities) },
      { label: "자본총계", value: (y) => won(y.totalEquity) },
    ],
  },
  {
    title: "수익성·안정성",
    rows: [
      { label: "영업이익률", value: (y) => pct(y.operatingMargin) },
      { label: "순이익률", value: (y) => pct(y.netMargin) },
      { label: "ROE", value: (y) => pct(y.roe) },
      { label: "부채비율", value: (y) => pct(y.debtRatio) },
    ],
  },
  {
    title: "주당",
    rows: [
      { label: "EPS", value: (y) => perShare(y.eps) },
      { label: "주당배당금", value: (y) => perShare(y.dividendPerShare) },
    ],
  },
];

const BARS = [
  { key: "revenue", label: "매출액", className: "bg-line-strong" },
  { key: "operatingIncome", label: "영업이익", className: "bg-accent" },
  { key: "netIncome", label: "당기순이익", className: "bg-warning" },
] as const;

/** 연도별 매출·영업이익·순이익 막대. 적자는 크기만큼 흐리게 그린다. */
function TrendBars({ years }: { years: FinancialYear[] }) {
  const values = years.flatMap((y) => BARS.map((b) => y[b.key] ?? 0));
  const max = Math.max(...values.map(Math.abs), 1);
  const hasLoss = values.some((v) => v < 0);
  const H = 96;

  return (
    <figure aria-label="실적 추이" className="space-y-2">
      <div className="flex items-end justify-around gap-4" style={{ height: H + 20 }}>
        {years.map((y) => (
          <div key={y.year} className="flex h-full flex-1 flex-col items-center">
            <div className="relative flex w-full max-w-28 flex-1 items-end justify-center gap-1">
              {BARS.map((b) => {
                const v = y[b.key];
                const size = v == null ? 0 : (Math.abs(v) / max) * H;
                return (
                  <div
                    key={b.key}
                    title={`${y.year} ${b.label} ${won(v)}`}
                    className={cn("w-1/4 rounded-t-[3px]", b.className, v != null && v < 0 && "opacity-60")}
                    style={{ height: `${Math.max(size, v == null ? 0 : 2)}px` }}
                  />
                );
              })}
            </div>
            <span className="mt-1 text-xs tabular-nums text-fg-muted">{y.year}</span>
          </div>
        ))}
      </div>
      <figcaption className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
        {BARS.map((b) => (
          <span key={b.key} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-sm", b.className)} aria-hidden />
            {b.label}
          </span>
        ))}
        {hasLoss && <span>흐린 막대 = 적자</span>}
      </figcaption>
    </figure>
  );
}

/**
 * 재무 지표 — 최근 3개 사업연도 실적·재무상태·비율·주당 지표와 전년 대비 증감.
 * OpenDART 사업보고서의 당기·전기·전전기 값으로 만든다.
 */
export default function FinancialsPanel({ overview }: { overview: StockOverview | null }) {
  if (!overview) return <Skeleton className="m-3 h-72" />;

  const v = overview.valuation;
  if (!v || v.history.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-fg-subtle">
        {overview.valuationNote ?? "재무 지표를 제공하지 않는 종목입니다."}
      </p>
    );
  }

  const years = v.history;

  return (
    <div className="space-y-4 p-3 xl:grid xl:grid-cols-[18rem_minmax(0,1fr)] xl:items-start xl:gap-4 xl:space-y-0">
      <TrendBars years={years} />

      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full min-w-[34rem] text-sm tabular-nums">
          <thead className="bg-surface-2 text-xs text-fg-subtle">
            <tr>
              <th className="px-3 py-2 text-left font-normal">항목</th>
              {years.map((y) => (
                <th key={y.year} className="px-3 py-2 text-right font-normal">
                  {y.year}
                </th>
              ))}
            </tr>
          </thead>
          {GROUPS.map((g) => (
            <tbody key={g.title} className="border-t border-line">
              <tr>
                <td colSpan={years.length + 1} className="px-3 pt-2.5 pb-1 text-left text-xs font-semibold text-fg-muted">
                  {g.title}
                </td>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-fg-muted">
                    {r.label}
                  </th>
                  {years.map((y) => {
                    const change = r.growth?.(y) ?? null;
                    return (
                      <td key={y.year} className="px-3 py-1.5 text-right text-fg">
                        {r.value(y)}
                        {change != null && (
                          <span className={cn("block text-[11px]", TONE_TEXT[changeTone(change)])}>
                            전년 대비 {formatRate(change)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <p className="text-[11px] text-fg-subtle xl:col-span-2">
        OpenDART {v.basis} 기준 (전기·전전기 값은 같은 보고서의 비교 수치). 증감률은 전년 값의 절댓값 대비입니다.
      </p>
    </div>
  );
}
