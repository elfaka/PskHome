"use client";

import { useState } from "react";

import type { StockOverview } from "@/api/stockSim";
import Skeleton from "@/components/ui/Skeleton";
import { formatKrwCompact, formatNumber, formatPercent } from "@/lib/stocksim/format";
import { glossaryTerm } from "@/lib/stocksim/glossary";

import { InfoButton, TermExplain } from "./Glossary";

/** 지표 한 줄 — 이름 옆 ⓘ 를 누르면 용어 설명이 아래에 펼쳐진다 */
function MetricRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [open, setOpen] = useState(false);
  const term = glossaryTerm(label);

  return (
    <div className="px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-sm text-fg-muted">
          {label}
          {term && <InfoButton name={label} open={open} onToggle={() => setOpen((o) => !o)} />}
          {hint && <span className="ml-1.5 text-[11px] text-fg-subtle">{hint}</span>}
        </dt>
        <dd className="text-sm font-semibold tabular-nums text-fg">{value}</dd>
      </div>
      {open && term && <TermExplain term={term} className="mt-1.5 rounded-control bg-surface-2 px-2.5 py-2" />}
    </div>
  );
}

/**
 * 투자 지표 — 시가총액·52주 범위(토스) + 재무 지표(OpenDART 사업보고서).
 * 재무 지표를 못 구하면 그 이유(키 미설정, ETF 등)를 보여준다. 지표 이름 옆 ⓘ 로 용어 설명을 펼친다.
 */
export default function ValuationPanel({ overview }: { overview: StockOverview | null }) {
  if (!overview) return <Skeleton className="m-3 h-60" />;

  const v = overview.valuation;
  const won = (n: number | null | undefined) => (n == null ? "-" : `${formatNumber(n)}원`);
  const big = (n: number | null | undefined) => (n == null ? "-" : `${formatKrwCompact(n)}원`);
  const times = (n: number | null | undefined, digits = 2) => (n == null ? "-" : `${n.toFixed(digits)}배`);
  const pct = (n: number | null | undefined) => (n == null ? "-" : formatPercent(n));

  const groups: { title: string; items: { label: string; value: string; hint?: string }[] }[] = [
    {
      title: "가치",
      items: [
        { label: "PER", value: v?.eps != null && v.eps <= 0 ? "적자" : times(v?.per), hint: "주가 ÷ 주당순이익" },
        { label: "PBR", value: times(v?.pbr), hint: "주가 ÷ 주당순자산" },
        { label: "EPS", value: won(v?.eps), hint: "주당순이익" },
        { label: "BPS", value: won(v?.bps), hint: "주당순자산" },
      ],
    },
    {
      title: "수익성·안정성",
      items: [
        { label: "ROE", value: pct(v?.roe), hint: "당기순이익 ÷ 자본총계" },
        { label: "영업이익률", value: pct(v?.operatingMargin) },
        { label: "부채비율", value: pct(v?.debtRatio), hint: "부채총계 ÷ 자본총계" },
        { label: "배당수익률", value: pct(v?.dividendYield), hint: `주당배당금 ${won(v?.dividendPerShare)}` },
      ],
    },
    {
      title: "규모",
      items: [
        { label: "시가총액", value: big(overview.marketCap) },
        { label: "매출액", value: big(v?.revenue) },
        { label: "영업이익", value: big(v?.operatingIncome) },
        { label: "당기순이익", value: big(v?.netIncome) },
      ],
    },
    {
      title: "가격 범위",
      items: [
        { label: "52주 최고", value: won(overview.high52w) },
        { label: "52주 최저", value: won(overview.low52w) },
        { label: "상장주식수", value: overview.sharesOutstanding == null ? "-" : `${formatNumber(overview.sharesOutstanding)}주` },
        { label: "전일 종가", value: won(overview.prevClose) },
      ],
    },
  ];

  return (
    <div className="space-y-3 p-3">
      {overview.valuationNote && (
        <p className="rounded-control bg-surface-2 px-3 py-2 text-xs text-fg-muted">{overview.valuationNote}</p>
      )}

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title} className="rounded-card border border-line">
            <h3 className="border-b border-line px-3 py-2 text-sm font-semibold text-fg">{g.title}</h3>
            <dl className="divide-y divide-line">
              {g.items.map((i) => (
                <MetricRow key={i.label} label={i.label} value={i.value} hint={i.hint} />
              ))}
            </dl>
          </section>
        ))}
      </div>

      <p className="text-[11px] text-fg-subtle">
        {v ? `재무: OpenDART ${v.basis} · ` : ""}시세: 토스증권 Open API. PER·PBR 은 현재가 기준으로 다시 계산합니다.
      </p>
    </div>
  );
}
