"use client";

import { getIntradayFlows, getInvestorFlows, type InvestorFlowDay, type IntradayFlows } from "@/api/stockSim";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { cumulative, flowTurn } from "@/lib/stocksim/flowTrend";
import { changeTone, formatClock, formatPercent, formatShares, TONE_TEXT } from "@/lib/stocksim/format";
import { usePolling } from "@/lib/stocksim/usePolling";

/** 일별 데이터라 자주 받을 필요가 없다 (백엔드도 10분 캐시). */
const REFRESH_MS = 10 * 60_000;
/** 장중 잠정치 (백엔드는 1분 캐시 + 5분마다 백그라운드 수집) */
const INTRADAY_REFRESH_MS = 2 * 60_000;

const signed = (v: number | null) => (v == null ? "-" : `${v > 0 ? "+" : ""}${formatShares(v)}`);
/** ISO → KST "10:30" */
const hhmm = (iso: string) => formatClock(iso).slice(0, 5);
/** "2026-10-30" → "10/30" */
const mmdd = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}`;

const SERIES = [
  { key: "foreigner", label: "외국인", fill: "fill-accent", stroke: "stroke-accent", swatch: "bg-accent" },
  { key: "institution", label: "기관", fill: "fill-warning", stroke: "stroke-warning", swatch: "bg-warning" },
] as const;

function Legend({ extra }: { extra?: string }) {
  return (
    <span className="flex flex-wrap gap-3">
      {SERIES.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-sm", s.swatch)} aria-hidden />
          {s.label}
        </span>
      ))}
      {extra && <span>{extra}</span>}
    </span>
  );
}

/**
 * 외국인·기관 수준값(누적 순매수) 선 그래프. `xs` 는 0~1 가로 위치.
 * 각 선의 고점(꺾인 지점)에 같은 색 점선을 세운다.
 */
function FlowLines({
  label,
  xs,
  values,
  axis,
}: {
  label: string;
  xs: number[];
  values: Record<(typeof SERIES)[number]["key"], number[]>;
  axis: [string, string];
}) {
  const W = 600;
  const H = 140;
  const PAD = 6;
  const all = SERIES.flatMap((s) => values[s.key]);
  // 데이터 범위에 맞춘다 (0 을 억지로 넣으면 작은 변화가 평평하게 보인다). 0 선은 범위 안일 때만 긋는다
  const max = Math.max(...all);
  const min = Math.min(...all);
  const span = max - min || 1;
  const zeroInRange = min <= 0 && max >= 0;
  const x = (f: number) => f * W;
  const y = (v: number) => PAD + ((max - v) / span) * (H - PAD * 2);

  return (
    <figure aria-label={label} className="rounded-card border border-line p-3">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-36 w-full" aria-hidden>
        {zeroInRange && (
          <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-line-strong" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        )}
        {SERIES.map((s) => {
          const turn = flowTurn(values[s.key]);
          const peak = turn?.kind === "belowPeak" ? turn.index : null;
          return (
            <g key={s.key}>
              {peak != null && (
                <line
                  x1={x(xs[peak])}
                  x2={x(xs[peak])}
                  y1={0}
                  y2={H}
                  className={s.stroke}
                  strokeOpacity={0.5}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <polyline
                points={values[s.key].map((v, i) => `${x(xs[i])},${y(v)}`).join(" ")}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                className={s.stroke}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-subtle">
        <span>
          {axis[0]} ~ {axis[1]}
        </span>
        <Legend extra={zeroInRange ? "회색 점선: 0 · 색 점선: 고점" : "색 점선: 고점"} />
      </figcaption>
    </figure>
  );
}

/** 선마다 "계속 늘고 있는지 / 어디서 꺾였는지" 한 줄 */
function TurnSummary({ values, labels }: { values: Record<(typeof SERIES)[number]["key"], number[]>; labels: string[] }) {
  return (
    <ul className="space-y-1 text-xs">
      {SERIES.map((s) => {
        const v = values[s.key];
        const last = v[v.length - 1] ?? 0;
        const turn = flowTurn(v);
        let text: string;
        let tone = changeTone(0);
        if (!turn) {
          text = `변화 없음 (${signed(last)})`;
        } else if (turn.kind === "high") {
          text = `계속 증가 — 지금이 최고 ${signed(last)} (${labels[turn.index]} 저점보다 ${signed(turn.change)})`;
          tone = "up";
        } else if (turn.kind === "low") {
          text = `계속 감소 — 지금이 최저 ${signed(last)} (${labels[turn.index]} 고점보다 ${signed(turn.change)})`;
          tone = "down";
        } else {
          text = `${labels[turn.index]} 고점 ${signed(v[turn.index])} 이후 ${signed(turn.change)} 줄어 현재 ${signed(last)}`;
          tone = "down";
        }
        return (
          <li key={s.key} className="flex gap-2">
            <span className="flex shrink-0 items-center gap-1.5 font-medium text-fg">
              <span className={cn("size-2 rounded-sm", s.swatch)} aria-hidden />
              {s.label}
            </span>
            <span className={TONE_TEXT[tone]}>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** 첫 기록 ~ 마지막 기록 시각을 0~1 로 (갱신 간격이 고르지 않아 시각 기준으로 놓는다) */
function timeFractions(isos: string[]): number[] {
  const times = isos.map((t) => Date.parse(t));
  const first = times[0];
  const span = times[times.length - 1] - first || 1;
  return times.map((t) => (t - first) / span);
}

/** 오늘 장중 외국인·기관 순매수 흐름 (서버가 잠정치를 모은 것) */
function IntradaySection({ symbol }: { symbol: string }) {
  const { data, error } = usePolling(symbol, () => getIntradayFlows(symbol), INTRADAY_REFRESH_MS, "장중 수급을 불러오지 못했습니다.");

  return (
    <section aria-label="오늘 장중 수급" className="space-y-2">
      <h3 className="text-xs font-semibold text-fg">오늘 장중 수급 (잠정치, 당일 누적 순매수)</h3>
      {error && !data ? (
        <p role="alert" className="text-xs text-danger-soft-fg">
          {error}
        </p>
      ) : !data ? (
        <Skeleton className="h-36" />
      ) : (
        <IntradayBody flows={data} />
      )}
    </section>
  );
}

function IntradayBody({ flows }: { flows: IntradayFlows }) {
  const { points } = flows;

  if (points.length === 0) {
    return (
      <p className="rounded-card border border-line px-3 py-4 text-center text-xs text-fg-subtle">
        오늘 잠정치가 아직 없습니다. 장이 열리면 외국인·기관 잠정치가 나옵니다
        {flows.latestDate ? ` (마지막 기록 ${flows.latestDate})` : ""}.
      </p>
    );
  }

  const values = { foreigner: points.map((p) => p.foreigner), institution: points.map((p) => p.institution) };
  const labels = points.map((p) => hhmm(p.at));

  return (
    <>
      {points.length >= 2 ? (
        <FlowLines
          label="오늘 장중 순매수 흐름"
          xs={timeFractions(points.map((p) => p.at))}
          values={values}
          axis={[labels[0], labels[labels.length - 1]]}
        />
      ) : (
        <p className="rounded-card border border-line px-3 py-3 text-xs text-fg-subtle">
          {labels[0]} 기준 외국인 {signed(points[0].foreigner)} · 기관 {signed(points[0].institution)}. 기록이 하나뿐이라 흐름은 다음 갱신부터 보입니다.
        </p>
      )}
      {points.length >= 2 && <TurnSummary values={values} labels={labels} />}
      <details className="text-xs">
        <summary className="cursor-pointer text-fg-muted">시각별 기록 {points.length}개</summary>
        <table className="mt-1 w-full tabular-nums">
          <thead className="text-fg-subtle">
            <tr>
              <th className="px-2 py-1 text-left font-normal">시각</th>
              <th className="px-2 py-1 text-right font-normal">외국인</th>
              <th className="px-2 py-1 text-right font-normal">기관</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.at} className="border-t border-line/60">
                <td className="px-2 py-1 text-fg-muted">{hhmm(p.at)}</td>
                <td className={cn("px-2 py-1 text-right", TONE_TEXT[changeTone(p.foreigner)])}>{signed(p.foreigner)}</td>
                <td className={cn("px-2 py-1 text-right", TONE_TEXT[changeTone(p.institution)])}>{signed(p.institution)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="text-[11px] text-fg-subtle">
        토스는 투자자 매매동향을 일별로만 줘서, 서버가 오늘 이 종목을 처음 조회한 때부터 갱신될 때마다 모은 기록입니다
        {flows.collecting ? " (장중에는 5분마다 계속 모읍니다)" : ""}. 그 이전 시간은 비어 있고, 서버가 다시 시작되면 처음부터 모읍니다.
      </p>
    </>
  );
}

/** 일별 누적 순매수 — 오래된 날부터 더한 값. 계속 쌓이는지, 어느 날부터 꺾였는지 본다 */
function CumulativeSection({ days }: { days: InvestorFlowDay[] }) {
  const ordered = [...days].reverse();
  if (ordered.length < 2) return null;

  const values = {
    foreigner: cumulative(ordered.map((d) => d.foreigner)),
    institution: cumulative(ordered.map((d) => d.institution)),
  };
  const labels = ordered.map((d) => mmdd(d.date));

  return (
    <section aria-label="일별 누적 순매수" className="space-y-2">
      <h3 className="text-xs font-semibold text-fg">일별 누적 순매수 ({ordered.length}거래일)</h3>
      <FlowLines
        label="일별 누적 순매수 추이"
        xs={ordered.map((_, i) => i / (ordered.length - 1))}
        values={values}
        axis={[ordered[0].date, ordered[ordered.length - 1].date]}
      />
      <TurnSummary values={values} labels={labels} />
    </section>
  );
}

/** 일별 외국인·기관 순매수 막대 (왼쪽이 오래된 날). 0 선 위가 순매수, 아래가 순매도. */
function NetBars({ days }: { days: InvestorFlowDay[] }) {
  const ordered = [...days].reverse();
  const max = Math.max(...ordered.flatMap((d) => SERIES.map((s) => Math.abs(d[s.key]))), 1);
  const STEP = 14;
  const H = 120;
  const mid = H / 2;

  return (
    <figure aria-label="일별 순매수 추이" className="rounded-card border border-line p-3">
      <svg viewBox={`0 0 ${ordered.length * STEP} ${H}`} preserveAspectRatio="none" className="h-32 w-full" aria-hidden>
        <line x1={0} x2={ordered.length * STEP} y1={mid} y2={mid} className="stroke-line-strong" vectorEffect="non-scaling-stroke" />
        {ordered.map((d, i) =>
          SERIES.map((s, j) => {
            const h = (Math.abs(d[s.key]) / max) * (mid - 4);
            return (
              <rect
                key={`${d.date}-${s.key}`}
                x={i * STEP + 2 + j * 5}
                width={4}
                y={d[s.key] >= 0 ? mid - h : mid}
                height={Math.max(h, 0.5)}
                className={s.fill}
              />
            );
          })
        )}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-subtle">
        <span>
          {ordered[0]?.date} ~ {ordered[ordered.length - 1]?.date}
        </span>
        <Legend extra="0 선 위 순매수 · 아래 순매도" />
      </figcaption>
    </figure>
  );
}

/** 투자자별 순매수(주)·외국인 보유율·공매도 비중 — 오늘 장중 흐름 + 최근 60거래일 */
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
    <div className="space-y-4 p-3">
      <dl className="grid grid-cols-3 gap-2">
        {totals.map((t) => (
          <div key={t.label} className="rounded-card border border-line bg-surface-2 px-3 py-2">
            <dt className="text-xs text-fg-subtle">{t.label} {days.length}일 누적</dt>
            <dd className={cn("text-base font-semibold tabular-nums", TONE_TEXT[changeTone(t.value)])}>{signed(t.value)}</dd>
          </div>
        ))}
      </dl>

      <IntradaySection symbol={symbol} />

      <CumulativeSection days={days} />

      <section aria-label="일별 순매수" className="space-y-2">
        <h3 className="text-xs font-semibold text-fg">일별 순매수</h3>
        <NetBars days={days} />
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
      </section>
    </div>
  );
}
