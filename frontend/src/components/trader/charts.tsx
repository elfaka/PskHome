"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import type {
  ChartInterval,
  TraderChart,
  TraderEquity,
  TraderIndicators,
  TraderPerformanceRow,
  TraderScores,
  TraderStats,
} from "@/api/trader";
import Alert from "@/components/ui/Alert";
import Skeleton from "@/components/ui/Skeleton";
import { useTheme } from "@/components/theme/useTheme";
import { cn } from "@/lib/cn";
import { TONE_TEXT } from "@/lib/stocksim/format";
import { cmpDec, formatDec, formatKst, formatRatioPct, signOf } from "@/lib/trader/decimal";

import { Kpi, Section, Signed } from "./ui";

/**
 * /trader 그래프·지표.
 *
 * - 종목 차트는 canvas(lightweight-charts) 라 브라우저에서만 불러온다 (테스트는 vi.mock)
 * - 나머지는 SVG/HTML 이라 테마 토큰 색을 그대로 쓴다
 * - 표시 숫자는 Decimal 문자열 그대로 포맷한다. number 는 픽셀 좌표 계산에만 쓴다
 * - 모든 그래프는 마우스·키보드(←/→)로 짚으면 값을 보여준다. 축은 하나만 쓴다
 */

const TraderCandleChart = dynamic(() => import("./TraderCandleChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

/** 픽셀 좌표용 (표시는 문자열 그대로) */
const px = (v: string | null | undefined): number => (v == null || v === "" || Number.isNaN(Number(v)) ? 0 : Number(v));

const KST_HM = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
const hm = (iso: string | null | undefined) => (iso ? KST_HM.format(new Date(iso)) : "—");

// ── 짚은 위치 (마우스·키보드) ──────────────────────────────────────────────────

function useHoverIndex(n: number, W: number, P: number) {
  const [i, setI] = useState<number | null>(null);
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
  const at = (ratio: number) => (n <= 1 ? 0 : clamp(Math.round(((ratio * W - P) * (n - 1)) / (W - 2 * P))));
  const bind = {
    tabIndex: 0,
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width > 0) setI(at((e.clientX - r.left) / r.width));
    },
    onPointerLeave: () => setI(null),
    onBlur: () => setI(null),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === "ArrowLeft") setI((v) => clamp((v ?? n) - 1));
      else if (e.key === "ArrowRight") setI((v) => clamp((v ?? -1) + 1));
      else if (e.key === "Escape") setI(null);
      else return;
      e.preventDefault();
    },
  };
  return [n > 0 && i != null ? clamp(i) : null, bind] as const;
}

/** 짚은 점 위에 띄우는 값 상자 — 오른쪽 절반에서는 왼쪽으로 펼친다 */
function Tip({ leftPct, children }: { leftPct: number; children: React.ReactNode }) {
  const right = leftPct > 55;
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-1 z-10 min-w-32 rounded-control border border-line bg-surface px-2.5 py-1.5 text-[11px] text-fg shadow-raised"
      style={right ? { right: `${100 - leftPct}%`, marginRight: 8 } : { left: `${leftPct}%`, marginLeft: 8 }}
    >
      {children}
    </div>
  );
}

function TipRow({ label, children, swatch }: { label: string; children: React.ReactNode; swatch?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 tabular-nums">
      <span className="flex items-center gap-1.5 text-fg-muted">
        {swatch && <span className={cn("inline-block h-2 w-2 rounded-sm", swatch)} aria-hidden />}
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-control bg-surface-2 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("rounded-control px-2.5 py-1", value === o.value ? "bg-surface text-fg shadow-card" : "text-fg-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── 종목 차트 ─────────────────────────────────────────────────────────────────

export function SymbolChartSection({
  symbol,
  symbols,
  interval,
  data,
  error,
  onSymbol,
  onInterval,
  className,
}: {
  symbol: string | null;
  symbols: string[];
  interval: ChartInterval;
  data: TraderChart | null;
  error: string | null;
  onSymbol: (s: string) => void;
  onInterval: (i: ChartInterval) => void;
  className?: string;
}) {
  const { resolved } = useTheme();
  const [hover, setHover] = useState<number | null>(null);
  const bars = data?.bars ?? [];
  const bar = hover != null ? bars[hover] : bars[bars.length - 1];
  const p = data?.position ?? null;

  return (
    <Section
      title="종목 차트"
      className={className}
      aside={
        <div className="flex flex-wrap items-center gap-2">
          {symbols.length > 1 ? (
            <Segmented label="종목" value={symbol ?? ""} options={symbols.map((s) => ({ value: s, label: s }))} onChange={onSymbol} />
          ) : (
            symbol && <span className="text-xs font-medium text-fg">{symbol}</span>
          )}
          <Segmented<ChartInterval>
            label="봉 주기"
            value={interval}
            options={[
              { value: 60, label: "1분" },
              { value: 300, label: "5분" },
            ]}
            onChange={onInterval}
          />
        </div>
      }
    >
      {error && <Alert className="mb-2">{error}</Alert>}
      <div className="mb-2 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-muted tabular-nums">
        <span className="text-fg-subtle">{data?.tradeDate ?? "—"}</span>
        {bar ? (
          <span>
            {hm(bar.t)} · 시 {formatDec(bar.o)} 고 {formatDec(bar.h)} 저 {formatDec(bar.l)} 종{" "}
            <span className="text-fg">{formatDec(bar.c)}</span> · 거래량 {formatDec(bar.v)}
          </span>
        ) : null}
      </div>
      <div className="relative h-72 sm:h-80 2xl:h-96">
        {data && bars.length > 0 ? (
          <TraderCandleChart data={data} theme={resolved} onHover={setHover} className="h-full w-full" />
        ) : data ? (
          <p className="flex h-full items-center justify-center text-xs text-fg-subtle">이 종목의 봉 기록이 아직 없습니다.</p>
        ) : (
          <Skeleton className="h-full w-full" />
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-muted" aria-label="차트 범례">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-warning" aria-hidden />
          VWAP
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-accent" aria-hidden />
          SMA20 (1분봉)
        </li>
        <li>
          <span className={TONE_TEXT.up}>▲</span> 매수 체결 · <span className={TONE_TEXT.down}>▼</span> 매도 체결
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-success" aria-hidden />
          주문 신호 승인 ·
          <span className="inline-block h-2 w-2 rounded-full bg-warning" aria-hidden />
          거부
        </li>
        {p && (
          <li className="tabular-nums">
            보유 {formatDec(p.qty)}주 · 평균 {formatDec(p.avgPrice)} · 손절 <span className={TONE_TEXT.down}>{formatDec(p.stopLoss)}</span> · 목표{" "}
            <span className={TONE_TEXT.up}>{formatDec(p.takeProfit)}</span>
          </li>
        )}
      </ul>
    </Section>
  );
}

// ── 종목 지표 카드 ────────────────────────────────────────────────────────────

function rsiZone(v: string | null): { text: string; tone: string } {
  if (cmpDec(v, "70") !== null && cmpDec(v, "70")! >= 0) return { text: "과매수 구간 (70 이상)", tone: TONE_TEXT.up };
  if (cmpDec(v, "30") !== null && cmpDec(v, "30")! <= 0) return { text: "과매도 구간 (30 이하)", tone: TONE_TEXT.down };
  return { text: v == null ? "데이터 대기" : "중립 (30~70)", tone: "text-fg" };
}

function Mini({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 rounded-control border border-line/70 bg-surface-2/50 px-3 py-2">
      <p className="truncate text-[11px] text-fg-muted">{label}</p>
      <p className={cn("truncate text-base font-semibold tabular-nums", tone ?? "text-fg")}>{value}</p>
      {hint && <p className="truncate text-[11px] text-fg-subtle">{hint}</p>}
    </div>
  );
}

export function IndicatorCards({ ind, symbol, className }: { ind: TraderIndicators | null; symbol: string | null; className?: string }) {
  const rsi = rsiZone(ind?.rsi14 ?? null);
  const vol = ind?.volumeRatio ?? null;
  const volOk = cmpDec(vol, "1.5");
  return (
    <Section
      title="종목 지표"
      className={className}
      aside={<span className="text-[11px] text-fg-subtle tabular-nums">{symbol ?? ""} · 판단 {hm(ind?.barTs)} 봉</span>}
    >
      {!ind ? (
        <p className="text-xs text-fg-subtle">점수 전략이 아직 지표를 기록하지 않았습니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Mini label="현재가 (봉 종가)" value={formatDec(ind.close)} />
          <Mini
            label="VWAP 대비"
            value={<Signed value={ind.vwapGap} digits={2} pct />}
            hint={`VWAP ${formatDec(ind.vwap)}`}
          />
          <Mini label="RSI 14" value={formatDec(ind.rsi14, 1)} hint={rsi.text} tone={rsi.tone} />
          <Mini
            label="MACD 히스토그램"
            value={<Signed value={ind.macdHist} digits={1} />}
            hint={signOf(ind.macdHist) === "up" ? "상승 모멘텀" : signOf(ind.macdHist) === "down" ? "하락 모멘텀" : "—"}
          />
          <Mini label="ATR 14" value={formatDec(ind.atr14)} hint="1분봉 평균 변동폭 (손절·목표 기준)" />
          <Mini
            label="거래량 비율"
            value={vol == null ? "—" : `${formatDec(vol, 2)}배`}
            hint={volOk == null ? "—" : volOk >= 0 ? "매수 조건 충족 (1.5배 이상)" : "매수 조건 미달 (1.5배 미만)"}
          />
        </div>
      )}
    </Section>
  );
}

// ── 시장 맥락 (점수 항목) ─────────────────────────────────────────────────────

const PART_LABEL: Record<string, string> = {
  technical: "가격 (기술 지표)",
  flow: "수급 (외국인·기관)",
  market: "시장 (코스피)",
  global: "글로벌 (VIX)",
  news: "뉴스·공시",
};

export function ScorePartsCard({ scores, className }: { scores: TraderScores | null; className?: string }) {
  const latest = scores?.latest ?? null;
  const keys = Object.keys(PART_LABEL).filter((k) => latest?.parts[k]);
  return (
    <Section
      title="점수 항목 (시장 맥락)"
      className={className}
      aside={<span className="text-[11px] text-fg-subtle tabular-nums">판단 {formatKst(latest?.ts)}</span>}
    >
      {keys.length === 0 ? (
        <p className="text-xs text-fg-subtle">점수 전략 판단 기록이 없습니다.</p>
      ) : (
        <ul className="space-y-2.5">
          {keys.map((k) => {
            const p = latest!.parts[k];
            const pct = Math.max(0, Math.min(100, (px(p.points) / Math.max(px(p.max), 1)) * 100));
            return (
              <li key={k} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className={cn("truncate", p.available ? "text-fg" : "text-fg-subtle")}>{PART_LABEL[k]}</span>
                  <span className="shrink-0 tabular-nums text-fg">
                    {formatDec(p.points)}
                    <span className="text-fg-subtle"> / {formatDec(p.max)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div className={cn("h-full rounded-full", p.available ? "bg-accent" : "bg-fg-subtle/40")} style={{ width: `${pct}%` }} />
                </div>
                <p className={cn("mt-0.5 truncate text-[11px]", p.available ? "text-fg-muted" : "text-fg-subtle")} title={p.note}>
                  {p.available ? p.note : `사용 안 함 — ${p.note}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ── 점수 추이 (쌓은 영역 + 합계 + 기준선) ──────────────────────────────────────

const SCORE_SERIES = [
  { key: "price", label: "가격", fill: "fill-series-1", swatch: "bg-series-1" },
  { key: "context", label: "맥락", fill: "fill-series-2", swatch: "bg-series-2" },
  { key: "issue", label: "이슈", fill: "fill-series-3", swatch: "bg-series-3" },
] as const;

const ACTION_TEXT: Record<string, string> = { BUY: "매수", SELL: "매도", EXIT: "청산", HOLD: "보유 유지", WAIT: "관망" };

export function ScoreTrendSection({ scores, error, className }: { scores: TraderScores | null; error: string | null; className?: string }) {
  const pts = scores?.points ?? [];
  const W = 600;
  const H = 200;
  const P = 4;
  const n = pts.length;
  const [hi, bind] = useHoverIndex(n, W, P);
  const x = (i: number) => (n <= 1 ? W / 2 : P + (i * (W - 2 * P)) / (n - 1));
  const y = (v: number) => H - (Math.max(0, Math.min(100, v)) / 100) * H;
  const th = scores?.thresholds ?? { buy: "80", watch: "65", exit: "30" };

  // 아래부터 가격 → 맥락 → 이슈 순서로 쌓는다
  const stacks = pts.map((p) => {
    const a = px(p.price);
    const b = a + px(p.context);
    return [a, b, b + px(p.issue)];
  });
  const band = (k: number) => {
    if (n === 0) return "";
    const top = stacks.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s[k]).toFixed(1)}`).join(" ");
    const bottom = stacks
      .map((s, i) => [i, k === 0 ? 0 : s[k - 1]] as const)
      .reverse()
      .map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");
    return `${top} ${bottom} Z`;
  };
  const total = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(px(p.total)).toFixed(1)}`).join(" ");
  const last = pts[n - 1];
  const hovered = hi != null ? pts[hi] : null;

  return (
    <Section
      title="점수 추이 (점수 전략)"
      className={className}
      aside={<span className="text-[11px] text-fg-subtle tabular-nums">{scores?.symbol ?? ""} · {scores?.tradeDate ?? "—"}</span>}
    >
      {error && <Alert className="mb-2">{error}</Alert>}
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-muted" aria-label="점수 범례">
        {SCORE_SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 tabular-nums">
            <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", s.swatch)} aria-hidden />
            {s.label} {last ? formatDec(last[s.key]) : "—"}
          </li>
        ))}
        <li className="flex items-center gap-1.5 tabular-nums">
          <span className="inline-block h-0.5 w-4 bg-fg" aria-hidden />
          합계 {last ? formatDec(last.total) : "—"}
        </li>
      </ul>
      {n === 0 ? (
        <p className="py-12 text-center text-xs text-fg-subtle">점수 전략 판단 기록이 없습니다.</p>
      ) : (
        <div
          {...bind}
          className="relative h-48 cursor-crosshair rounded-control outline-none focus-visible:ring-2 focus-visible:ring-ring 2xl:h-56"
          role="img"
          aria-label={`점수 추이 ${n}개 판단. 마지막 합계 ${last?.total ?? "—"}, 매수 기준 ${th.buy}. 좌우 화살표로 값을 볼 수 있습니다.`}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
            {SCORE_SERIES.map((s, k) => (
              <path key={s.key} d={band(k)} className={cn(s.fill, "opacity-80")} />
            ))}
            {[th.buy, th.watch, th.exit].map((v) => (
              <line
                key={v}
                x1={0}
                x2={W}
                y1={y(px(v))}
                y2={y(px(v))}
                className="stroke-fg-subtle"
                strokeDasharray="4 4"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path d={total} className="fill-none stroke-fg" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            {hi != null && (
              <line x1={x(hi)} x2={x(hi)} y1={0} y2={H} className="stroke-fg-muted" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {/* 기준선 이름 (SVG 가 늘어나므로 글자는 HTML 로) */}
          {[
            { v: th.buy, label: `매수 ${th.buy}` },
            { v: th.watch, label: `관찰 ${th.watch}` },
            { v: th.exit, label: `청산 ${th.exit}` },
          ].map((t) => (
            <span
              key={t.label}
              className="pointer-events-none absolute right-1 -translate-y-full rounded bg-surface/80 px-1 text-[10px] text-fg-muted"
              style={{ top: `${(y(px(t.v)) / H) * 100}%` }}
            >
              {t.label}
            </span>
          ))}
          {hovered && hi != null && (
            <Tip leftPct={(x(hi) / W) * 100}>
              <p className="mb-1 font-medium tabular-nums">
                {hm(hovered.t)} · {ACTION_TEXT[hovered.action] ?? hovered.action}
              </p>
              <TipRow label="합계">{formatDec(hovered.total)}</TipRow>
              {SCORE_SERIES.map((s) => (
                <TipRow key={s.key} label={s.label} swatch={s.swatch}>
                  {formatDec(hovered[s.key])}
                </TipRow>
              ))}
            </Tip>
          )}
        </div>
      )}
      <div className="mt-1 flex justify-between text-[10px] text-fg-subtle tabular-nums">
        <span>{hm(pts[0]?.t)}</span>
        <span>{hm(last?.t)}</span>
      </div>
    </Section>
  );
}

// ── 평가금액·낙폭 (일별) ───────────────────────────────────────────────────────

export function EquitySection({
  equity,
  current,
  error,
  className,
}: {
  equity: TraderEquity | null;
  current: string | null;
  error: string | null;
  className?: string;
}) {
  const pts = [
    ...(equity?.points ?? []).map((p) => ({ label: p.date.slice(5), equity: p.equity, dd: p.drawdown ?? null })),
    ...(current ? [{ label: "지금", equity: current, dd: equity?.current?.drawdown ?? null }] : []),
  ];
  const W = 600;
  const P = 6;
  const n = pts.length;
  const [hi, bind] = useHoverIndex(n, W, P);
  const x = (i: number) => (n <= 1 ? W / 2 : P + (i * (W - 2 * P)) / (n - 1));

  const EH = 140;
  const eq = pts.map((p) => px(p.equity));
  const min = Math.min(...eq);
  const max = Math.max(...eq);
  const span = max - min || Math.max(1, max * 0.001);
  const ey = (v: number) => EH - P - ((v - min) * (EH - 2 * P)) / span;
  const eLine = eq.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${ey(v).toFixed(1)}`).join(" ");
  const eArea = n ? `${eLine} L${x(n - 1).toFixed(1)},${EH} L${x(0).toFixed(1)},${EH} Z` : "";

  const DH = 70;
  const dd = pts.map((p) => Math.min(0, px(p.dd)));
  const ddMin = Math.min(-0.005, ...dd); // 낙폭이 없어도 0.5% 눈금은 잡는다
  const dy = (v: number) => (v / ddMin) * (DH - 2) + 1;
  const dLine = dd.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${dy(v).toFixed(1)}`).join(" ");
  const dArea = n ? `M${x(0).toFixed(1)},1 ${dLine.replace(/^M/, "L")} L${x(n - 1).toFixed(1)},1 Z` : "";
  const hovered = hi != null ? pts[hi] : null;

  return (
    <Section
      title="평가금액·낙폭"
      className={className}
      aside={
        <span className="text-[11px] text-fg-subtle tabular-nums">
          MDD <span className={signOf(equity?.mdd) === "down" ? TONE_TEXT.down : undefined}>{formatRatioPct(equity?.mdd ?? null, 2, false)}</span>
        </span>
      }
    >
      {error && <Alert className="mb-2">{error}</Alert>}
      {n < 2 ? (
        <p className="py-10 text-center text-xs text-fg-subtle">추이를 그리려면 거래일이 이틀 이상 쌓여야 합니다.</p>
      ) : (
        <div
          {...bind}
          className="relative cursor-crosshair rounded-control outline-none focus-visible:ring-2 focus-visible:ring-ring"
          role="img"
          aria-label={`평가금액 추이 ${n}개 점, 최대 낙폭 ${formatRatioPct(equity?.mdd ?? null, 2, false)}. 좌우 화살표로 값을 볼 수 있습니다.`}
        >
          <p className="mb-0.5 text-[10px] text-fg-subtle">평가금액 (일별 시작 + 지금)</p>
          <svg viewBox={`0 0 ${W} ${EH}`} preserveAspectRatio="none" className="h-32 w-full" aria-hidden>
            <path d={eArea} className="fill-accent-soft" />
            <path d={eLine} className="fill-none stroke-accent" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {hi != null && <line x1={x(hi)} x2={x(hi)} y1={0} y2={EH} className="stroke-fg-muted" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          </svg>
          <p className="mt-2 mb-0.5 text-[10px] text-fg-subtle">최고점 대비 하락폭 (0% 가 위)</p>
          <svg viewBox={`0 0 ${W} ${DH}`} preserveAspectRatio="none" className="h-16 w-full" aria-hidden>
            <line x1={0} x2={W} y1={1} y2={1} className="stroke-line-strong" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <path d={dArea} className="fill-info-soft" />
            <path d={dLine} className="fill-none stroke-info" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            {hi != null && <line x1={x(hi)} x2={x(hi)} y1={0} y2={DH} className="stroke-fg-muted" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          </svg>
          {hovered && hi != null && (
            <Tip leftPct={(x(hi) / W) * 100}>
              <p className="mb-1 font-medium">{hovered.label}</p>
              <TipRow label="평가금액">{formatDec(hovered.equity)}</TipRow>
              <TipRow label="하락폭">
                <span className={signOf(hovered.dd) === "down" ? TONE_TEXT.down : undefined}>{formatRatioPct(hovered.dd, 2, false)}</span>
              </TipRow>
            </Tip>
          )}
          <div className="mt-1 flex justify-between text-[10px] text-fg-subtle tabular-nums">
            <span>
              {pts[0].label} · {formatDec(pts[0].equity)}
            </span>
            <span>
              {pts[n - 1].label} · {formatDec(pts[n - 1].equity)}
            </span>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── 오늘 통계 (핵심 숫자 둘째 줄) ──────────────────────────────────────────────

export function StatsRow({ stats }: { stats: TraderStats | null }) {
  const t = stats?.today;
  const tripsToday = stats?.trips.today;
  const tripsAll = stats?.trips.all;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Kpi label="오늘 체결" hint={t ? `매수 ${t.buys} · 매도 ${t.sells}` : undefined}>
        {t ? `${t.fills}건` : "—"}
      </Kpi>
      <Kpi
        label="승률 (청산된 거래)"
        hint={tripsAll ? `오늘 ${tripsToday?.wins ?? 0}/${tripsToday?.count ?? 0} · 전체 ${tripsAll.wins}/${tripsAll.count}` : undefined}
      >
        {tripsToday?.count ? formatRatioPct(tripsToday.winRate, 0, false) : tripsAll?.count ? formatRatioPct(tripsAll.winRate, 0, false) : "—"}
        {!tripsToday?.count && tripsAll?.count ? <span className="ml-1 text-xs font-normal text-fg-subtle">전체</span> : null}
      </Kpi>
      <Kpi label="거래당 평균 손익" hint={tripsAll?.count ? `비용 차감 · 합계 ${formatDec(tripsAll.netPnl, 0, true)}` : "청산된 거래 없음"}>
        <Signed value={tripsAll?.avgPnl ?? null} />
      </Kpi>
      <Kpi label="오늘 비용" hint={t ? `수수료 ${formatDec(t.commission)} · 세금 ${formatDec(t.tax)}` : undefined}>
        {t ? formatDec(t.costs) : "—"}
      </Kpi>
      <Kpi label="실현 / 평가 손익" hint="실현은 누적·비용 차감 전">
        <span className="text-xl">
          <Signed value={stats?.realizedPnl ?? null} /> <span className="text-fg-subtle">/</span> <Signed value={stats?.unrealizedPnl ?? null} />
        </span>
      </Kpi>
      <Kpi label="계획 손익비 (오늘 매수)" hint="위험 관리가 계산한 비용 차감 값의 평균">
        {t?.avgPlannedRiskReward ? `${formatDec(t.avgPlannedRiskReward, 2)}` : "—"}
      </Kpi>
    </div>
  );
}

// ── 위험 관리 거부 사유 (오늘) ─────────────────────────────────────────────────

const REJECT_TEXT: Record<string, string> = {
  LOW_RISK_REWARD: "손익비 부족",
  WIDE_SPREAD: "호가 스프레드 넓음",
  MAX_ORDER_VALUE: "1회 주문 한도",
  MAX_POSITION_VALUE: "종목 보유 한도",
  DAILY_LOSS_LIMIT: "하루 손실 한도",
  INSUFFICIENT_CASH: "현금 부족",
  INSUFFICIENT_POSITION: "매도 수량 부족",
  NO_STOP: "손절가 계산 불가 (ATR 없음)",
  NEAR_UPPER_LIMIT: "상한가 근접",
  NO_PRICE_LIMIT: "상·하한가 정보 없음",
  ENTRY_CUTOFF: "신규 진입 마감 이후",
  MARKET_CLOSED: "장 시간 외",
  STALE_QUOTE: "오래된 시세",
  NO_QUOTE: "시세 없음",
  NO_DAY_BASELINE: "오늘 기준 평가금액 없음",
  HALTED: "긴급 정지 중",
  INVALID_QTY: "수량 오류",
  DATA_UNHEALTHY: "데이터 이상",
  DB_UNHEALTHY: "DB 이상",
  ENGINE_ERROR: "엔진 오류",
};

export function RejectionSection({ stats, error, className }: { stats: TraderStats | null; error: string | null; className?: string }) {
  const rows = stats?.rejections ?? [];
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((a, r) => a + r.count, 0);
  return (
    <Section
      title="오늘 막힌 주문 (위험 관리)"
      className={className}
      aside={<span className="text-[11px] text-fg-subtle tabular-nums">{total}건</span>}
    >
      {error && <Alert className="mb-2">{error}</Alert>}
      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-fg-subtle">오늘 위험 관리가 막은 주문이 없습니다.</p>
      ) : (
        <ul className="space-y-2" aria-label="거부 사유별 건수">
          {rows.map((r) => (
            <li key={r.code} className="min-w-0" title={r.sample ?? undefined}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-fg">{REJECT_TEXT[r.code] ?? r.code}</span>
                <span className="shrink-0 tabular-nums text-fg">{r.count}건</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className="h-full rounded-full bg-warning" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
              {r.sample && <p className="mt-0.5 truncate text-[11px] text-fg-subtle">예: {r.sample.replace(/^[A-Z_]+:\s*/, "")}</p>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── 신호 성과 (기간별 평균 수익률, 0 기준 양쪽 막대) ─────────────────────────────

const HORIZON_TEXT: Record<string, string> = { "5m": "5분", "15m": "15분", "30m": "30분", close: "장마감" };

export function PerformanceChart({ rows }: { rows: TraderPerformanceRow[] | null }) {
  const data = (rows ?? []).filter((r) => r.count > 0);
  if (rows && data.length === 0) {
    return <p className="py-4 text-center text-xs text-fg-subtle">평가가 끝난 신호가 아직 없습니다.</p>;
  }
  const groups = new Map<string, TraderPerformanceRow[]>();
  for (const r of data) {
    const k = `${r.strategyId} · ${r.action}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const maxAbs = Math.max(0.001, ...data.map((r) => Math.abs(px(r.avgReturnPct))));
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {[...groups.entries()].map(([name, list]) => (
        <figure key={name} className="min-w-0">
          <figcaption className="mb-2 text-xs font-medium text-fg">{name}</figcaption>
          <ul className="space-y-1.5">
            {list.map((r) => {
              const v = px(r.avgReturnPct);
              const w = (Math.abs(v) / maxAbs) * 50;
              const up = signOf(r.avgReturnPct) === "up";
              return (
                <li
                  key={r.horizon}
                  className="grid grid-cols-[3rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-[11px]"
                  title={`평가 ${r.count}건 · 승률 ${formatRatioPct(r.winRate, 0, false)} · 최대 유리 ${formatRatioPct(r.avgMfePct, 2)} · 최대 불리 ${formatRatioPct(r.avgMaePct, 2)}`}
                >
                  <span className="text-fg-muted">{HORIZON_TEXT[r.horizon] ?? r.horizon}</span>
                  <span className="relative h-3" aria-hidden>
                    <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                    <span
                      className={cn("absolute inset-y-0.5 rounded-sm", up ? "left-1/2 bg-danger" : "right-1/2 bg-info")}
                      style={{ width: `${w}%` }}
                    />
                  </span>
                  <span className="text-right tabular-nums">
                    <Signed value={r.avgReturnPct} digits={2} pct />
                    <span className="block text-fg-subtle">승률 {formatRatioPct(r.winRate, 0, false)} · {r.count}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </figure>
      ))}
    </div>
  );
}
