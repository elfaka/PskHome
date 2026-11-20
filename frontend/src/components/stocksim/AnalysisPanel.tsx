"use client";

import { useState } from "react";

import { getAnalysis, type Analysis, type AnalysisFactor, type FactorCategory, type Rating } from "@/api/stockSim";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { formatClock, formatNumber, formatRate } from "@/lib/stocksim/format";
import { usePolling } from "@/lib/stocksim/usePolling";

import { GlossaryList } from "./Glossary";

const REFRESH_MS = 60_000;

/** 등급 배지 — Badge 는 크기가 고정이라(cn 이 클래스 충돌을 병합하지 않는다) 큰 배지는 따로 그린다. */
const RATING_CLASS: Record<Rating, string> = {
  STRONG_BUY: "bg-danger text-surface",
  BUY: "bg-danger-soft text-danger-soft-fg",
  NEUTRAL: "bg-surface text-fg-muted",
  SELL: "bg-info-soft text-info-soft-fg",
  STRONG_SELL: "bg-info text-surface",
};

const CATEGORY_LABEL: Record<FactorCategory, string> = {
  trend: "추세",
  momentum: "모멘텀",
  position: "가격 위치",
  flow: "수급",
  valuation: "가치",
};

const CATEGORIES: FactorCategory[] = ["trend", "momentum", "position", "flow", "valuation"];

/** -100 ~ 100 점수 게이지. 왼쪽 파랑(매도) ~ 오른쪽 빨강(매수). */
function ScoreGauge({ score }: { score: number }) {
  const pos = ((score + 100) / 200) * 100;
  return (
    <div className="w-full">
      <div className="relative h-2 rounded-full bg-gradient-to-r from-info via-surface-2 to-danger">
        <div
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-fg shadow-raised"
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="mt-1.5 grid grid-cols-5 text-center text-[10px] text-fg-subtle">
        <span>강력 매도</span>
        <span>매도</span>
        <span>중립</span>
        <span>매수</span>
        <span>강력 매수</span>
      </div>
    </div>
  );
}

function ScorePill({ factor }: { factor: AnalysisFactor }) {
  if (factor.signal === "unavailable") return <Badge>데이터 없음</Badge>;
  if (factor.signal === "info") return <Badge tone="accent">참고</Badge>;

  const text = `${factor.score > 0 ? "+" : ""}${factor.score} / ${factor.maxScore}`;
  return <Badge tone={factor.score > 0 ? "danger" : factor.score < 0 ? "info" : "neutral"}>{text}</Badge>;
}

/** 점수 막대 — 가운데 기준으로 매수(오른쪽 빨강) / 매도(왼쪽 파랑) */
function FactorBar({ factor }: { factor: AnalysisFactor }) {
  if (factor.maxScore === 0) return <div className="h-1.5" />;
  const width = (Math.abs(factor.score) / factor.maxScore) * 50;
  return (
    <div className="relative h-1.5 rounded-full bg-surface-2" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
      <div
        className={cn("absolute inset-y-0 rounded-full", factor.score >= 0 ? "left-1/2 bg-danger" : "right-1/2 bg-info")}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

/** 항목을 펼치면 보이는 상세 — 무엇인지, 계산에 쓴 값, 점수 기준표(받은 줄 강조), 주의점 */
function FactorDetail({ factor }: { factor: AnalysisFactor }) {
  return (
    <div className="mt-2 space-y-3 rounded-control bg-surface-2 p-3 text-xs leading-5">
      <section>
        <h4 className="mb-0.5 font-semibold text-fg">무엇을 보나요</h4>
        <p className="text-fg-muted">{factor.description}</p>
      </section>

      {factor.values.length > 0 && (
        <section>
          <h4 className="mb-1 font-semibold text-fg">계산에 쓴 값</h4>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            {factor.values.map((v) => (
              <div key={v.label} className="flex min-w-0 justify-between gap-2">
                <dt className="truncate text-fg-subtle">{v.label}</dt>
                <dd className="font-medium whitespace-nowrap tabular-nums text-fg">{v.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {factor.rules.length > 0 && (
        <section>
          <h4 className="mb-1 font-semibold text-fg">점수 기준</h4>
          <table aria-label={`${factor.label} 점수 기준`} className="w-full">
            <tbody>
              {factor.rules.map((r) => (
                <tr
                  key={r.condition}
                  aria-current={r.matched ? "true" : undefined}
                  className={cn(r.matched ? "bg-accent-soft font-semibold text-accent-soft-fg" : "text-fg-muted")}
                >
                  <td className="rounded-l-control px-2 py-0.5">
                    {r.condition}
                    {r.matched && <span className="ml-1.5 text-[10px]">← 현재</span>}
                  </td>
                  <td className="rounded-r-control px-2 py-0.5 text-right tabular-nums">{signed(r.points)}점</td>
                </tr>
              ))}
            </tbody>
          </table>
          {factor.signal === "unavailable" && <p className="mt-1 text-fg-subtle">데이터가 없어 0점으로 계산했습니다.</p>}
        </section>
      )}

      {factor.caution && (
        <p className="rounded-control border border-warning/40 px-2 py-1.5 text-warning-soft-fg">
          <span className="font-semibold">주의</span> {factor.caution}
        </p>
      )}
    </div>
  );
}

/** 종합 점수를 어떻게 계산하는지 — 항목 점수 합 → 구간별 등급 */
function ScoreMethod({ analysis }: { analysis: Analysis }) {
  const scored = analysis.factors.filter((f) => f.maxScore > 0);
  const maxTotal = scored.reduce((s, f) => s + f.maxScore, 0);

  return (
    <details className="group rounded-card border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-fg">
        점수는 이렇게 계산합니다
        <span aria-hidden className="text-xs text-fg-subtle transition group-open:rotate-180">
          ▼
        </span>
      </summary>
      <div className="space-y-3 border-t border-line px-3 py-3 text-xs leading-5 text-fg-muted">
        <p>
          추세·모멘텀·가격 위치·수급·가치 5개 분류의 {scored.length}개 항목마다 점수 기준표에 따라 매수 쪽(+) 또는 매도 쪽(-) 점수를 주고
          모두 더합니다 (항목 최대 점수 합 ±{maxTotal}). 데이터가 없는 항목은 0점입니다. 합계는 -100~+100 으로 자른 뒤 아래 구간으로 등급을
          정합니다. 각 항목을 누르면 계산에 쓴 값과 기준표를 볼 수 있습니다.
        </p>
        <table aria-label="등급 구간" className="w-full max-w-sm">
          <tbody>
            {analysis.ratingScale.map((band) => (
              <tr
                key={band.rating}
                aria-current={band.rating === analysis.rating ? "true" : undefined}
                className={cn(band.rating === analysis.rating && "bg-accent-soft font-semibold text-accent-soft-fg")}
              >
                <td className="rounded-l-control px-2 py-0.5">
                  <span className={cn("inline-block rounded-full px-2 text-[11px]", RATING_CLASS[band.rating])}>{band.label}</span>
                </td>
                <td className="px-2 py-0.5 tabular-nums">{band.range}</td>
                <td className="rounded-r-control px-2 py-0.5 text-right">
                  {band.rating === analysis.rating ? `현재 ${signed(analysis.score)}점` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * 매수·매도 추천 — 종합 점수와 등급, 항목별 점수와 사유.
 * 항목을 누르면 무엇을 보는 지표인지·계산에 쓴 값·점수 기준표·주의점이 펼쳐진다.
 * 규칙 기반 교육용 신호라는 안내를 항상 함께 보여준다.
 */
export default function AnalysisPanel({ symbol }: { symbol: string }) {
  const { data: a, error } = usePolling(symbol, () => getAnalysis(symbol), REFRESH_MS, "분석을 불러오지 못했습니다.");
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (error && !a) {
    return (
      <p role="alert" className="p-6 text-center text-sm text-danger-soft-fg">
        {error}
      </p>
    );
  }
  if (!a) return <Skeleton className="m-3 h-80" />;

  const allOpen = a.factors.length > 0 && a.factors.every((f) => open.has(f.key));
  const ind = a.indicators;
  const snapshot: { label: string; value: string }[] = [
    { label: "RSI(14)", value: ind.rsi14 == null ? "-" : ind.rsi14.toFixed(1) },
    { label: "MACD", value: ind.macd == null ? "-" : formatNumber(ind.macd, 1) },
    { label: "시그널", value: ind.macdSignal == null ? "-" : formatNumber(ind.macdSignal, 1) },
    { label: "MA20", value: ind.ma20 == null ? "-" : formatNumber(ind.ma20) },
    { label: "MA60", value: ind.ma60 == null ? "-" : formatNumber(ind.ma60) },
    { label: "MA120", value: ind.ma120 == null ? "-" : formatNumber(ind.ma120) },
    { label: "볼린저 상단", value: ind.bollingerUpper == null ? "-" : formatNumber(ind.bollingerUpper) },
    { label: "볼린저 하단", value: ind.bollingerLower == null ? "-" : formatNumber(ind.bollingerLower) },
    { label: "1년 수익률", value: ind.return1y == null ? "-" : formatRate(ind.return1y) },
  ];

  return (
    <div className="space-y-3 p-3">
      <div className="grid gap-4 rounded-card border border-line bg-surface-2 p-4 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className="text-[11px] text-fg-subtle">종합 신호</div>
            <span className={cn("mt-1 inline-block rounded-full px-3 py-1 text-base font-bold", RATING_CLASS[a.rating])}>
              {a.ratingLabel}
            </span>
          </div>
          <div className="text-center">
            <div className="text-[11px] text-fg-subtle">점수</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-fg">
              {a.score > 0 ? "+" : ""}
              {a.score}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <ScoreGauge score={a.score} />
          <p className="text-sm text-fg">{a.summary}</p>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs sm:grid-cols-5 xl:grid-cols-9">
        {snapshot.map((s) => (
          <div key={s.label}>
            <dt className="text-fg-subtle">{s.label}</dt>
            <dd className="font-medium tabular-nums text-fg">{s.value}</dd>
          </div>
        ))}
      </dl>

      <ScoreMethod analysis={a} />

      <div className="flex items-center justify-between gap-2 text-xs text-fg-subtle">
        <span>항목을 누르면 계산 근거와 점수 기준을 볼 수 있습니다.</span>
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(a.factors.map((f) => f.key)))}
          className="shrink-0 rounded-control px-2 py-1 font-medium text-fg-muted transition hover:bg-surface-hover hover:text-fg"
        >
          {allOpen ? "모두 접기" : "모두 펼치기"}
        </button>
      </div>

      <div className="grid items-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const factors = a.factors.filter((f) => f.category === cat);
          if (factors.length === 0) return null;
          const sum = factors.reduce((s, f) => s + f.score, 0);
          return (
            <section key={cat} aria-label={`${CATEGORY_LABEL[cat]} 분석`} className="rounded-card border border-line">
              <h3 className="flex items-center justify-between border-b border-line px-3 py-2 text-sm font-semibold text-fg">
                {CATEGORY_LABEL[cat]}
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    sum > 0 ? "text-danger-soft-fg" : sum < 0 ? "text-info-soft-fg" : "text-fg-muted"
                  )}
                >
                  {sum > 0 ? "+" : ""}
                  {sum}점
                </span>
              </h3>
              <ul className="divide-y divide-line">
                {factors.map((f) => {
                  const expanded = open.has(f.key);
                  return (
                    <li key={f.key} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggle(f.key)}
                        aria-expanded={expanded}
                        className="block w-full space-y-1 text-left"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
                            <span aria-hidden className={cn("text-[10px] text-fg-subtle transition", expanded && "rotate-90")}>
                              ▶
                            </span>
                            {f.label}
                          </span>
                          <ScorePill factor={f} />
                        </span>
                        <FactorBar factor={f} />
                        <span
                          className={cn("block text-xs leading-5", f.signal === "unavailable" ? "text-fg-subtle" : "text-fg-muted")}
                        >
                          {f.reason}
                        </span>
                      </button>
                      {expanded && <FactorDetail factor={f} />}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <GlossaryList group="signal" />

      <p className="rounded-control bg-warning-soft px-3 py-2 text-xs leading-5 text-warning-soft-fg">
        {a.disclaimer} · {formatClock(a.asOf)} 기준, 1분마다 다시 계산합니다.
      </p>
    </div>
  );
}
