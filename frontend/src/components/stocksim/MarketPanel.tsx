"use client";

import {
  getMarketInvestors,
  type FearGreed,
  type FearGreedFactor,
  type MarketChartSymbol,
  type MarketIndexSymbol,
  type MarketInvestorDay,
  type MarketOverview,
  type VixLevel,
  type VixSummary,
} from "@/api/stockSim";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import {
  FEAR_GREED_BANDS,
  FEAR_GREED_LABEL,
  FEAR_GREED_STROKE,
  FEAR_GREED_TEXT,
  fearGreedLevel,
} from "@/lib/stocksim/fearGreed";
import { changeTone, formatClock, formatKrwCompact, formatNumber, formatRate, TONE_TEXT } from "@/lib/stocksim/format";
import { usePolling } from "@/lib/stocksim/usePolling";

import ChartPanel from "./ChartPanel";

/** 일별 데이터라 드물게 받는다 (백엔드 5분 캐시). */
const INVESTOR_REFRESH_MS = 5 * 60_000;

const INDEX_TABS: { value: MarketChartSymbol; label: string }[] = [
  { value: "KOSPI", label: "코스피" },
  { value: "KOSDAQ", label: "코스닥" },
  { value: "VIX", label: "VIX" },
];

/** VIX 구간 경계와 색 — 변동성(위험) 계기판이라 경고 색을 쓴다 */
const VIX_BANDS: { level: VixLevel; label: string; from: number; to: number; className: string; text: string }[] = [
  { level: "CALM", label: "안정", from: 0, to: 15, className: "bg-success", text: "text-success-soft-fg" },
  { level: "NORMAL", label: "보통", from: 15, to: 20, className: "bg-line-strong", text: "text-fg-muted" },
  { level: "ELEVATED", label: "불안", from: 20, to: 30, className: "bg-warning", text: "text-warning-soft-fg" },
  { level: "FEAR", label: "공포", from: 30, to: 50, className: "bg-danger", text: "text-danger-soft-fg" },
];
const VIX_SCALE_MAX = 50;

/** VIX — 현재 구간, 시·고·저가, 설명. 투자자별 매매대금 대신 보여준다. */
function VixCard({ vix, note }: { vix: VixSummary | null; note: string | null }) {
  if (!vix) {
    return <p className="rounded-card border border-line p-6 text-center text-sm text-fg-subtle">{note ?? "VIX 를 불러오지 못했습니다."}</p>;
  }

  const band = VIX_BANDS.find((b) => b.level === vix.level) ?? VIX_BANDS[1];
  const pos = Math.min(100, (vix.value / VIX_SCALE_MAX) * 100);
  const stats = [
    { label: "시가", value: vix.open },
    { label: "고가", value: vix.high },
    { label: "저가", value: vix.low },
    { label: "전일 종가", value: vix.prevClose },
  ];

  return (
    <section aria-label="VIX 변동성 지수" className="rounded-card border border-line">
      <h3 className="border-b border-line px-3 py-2 text-sm font-semibold text-fg">VIX 변동성 지수</h3>
      <div className="space-y-4 p-3">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold tabular-nums text-fg">{formatNumber(vix.value, 2)}</span>
          <span className={cn("text-sm font-semibold", band.text)}>{vix.levelLabel}</span>
        </div>

        <div aria-hidden>
          <div className="relative flex h-2 overflow-hidden rounded-full">
            {VIX_BANDS.map((b) => (
              <div key={b.level} className={b.className} style={{ width: `${((b.to - b.from) / VIX_SCALE_MAX) * 100}%` }} />
            ))}
          </div>
          <div className="relative h-3">
            <span
              className="absolute top-0 size-0 -translate-x-1/2 border-x-[5px] border-b-[6px] border-x-transparent border-b-fg"
              style={{ left: `${pos}%` }}
            />
          </div>
          <div className="relative h-4 text-[10px] text-fg-subtle">
            {[15, 20, 30].map((v) => (
              <span key={v} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${(v / VIX_SCALE_MAX) * 100}%` }}>
                {v}
              </span>
            ))}
          </div>
        </div>

        <dl className="grid grid-cols-4 gap-2 text-xs">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-fg-subtle">{s.label}</dt>
              <dd className="font-medium tabular-nums text-fg">{s.value == null ? "-" : formatNumber(s.value, 2)}</dd>
            </div>
          ))}
        </dl>

        <p className="text-xs leading-5 text-fg-muted">
          S&amp;P 500 옵션 가격으로 계산한 앞으로 30일 동안의 예상 변동성입니다. 높을수록 시장이 불안하다는 뜻이며,
          보통 15 미만은 안정, 20 이상은 불안, 30 이상은 공포 구간으로 봅니다. 미국 장 시간(한국 시간 밤 11시 30분~새벽 6시)에 움직입니다.
        </p>
        <p className="text-[11px] text-fg-subtle">
          {vix.source}
          {vix.timestamp && ` · ${formatClock(vix.timestamp)} (한국 시간) 기준`}
        </p>
      </div>
    </section>
  );
}

/** 반원 게이지의 점수 위치 (중심 100,100 반지름 r) */
function arcPoint(score: number, r: number) {
  const theta = Math.PI * (1 - score / 100);
  return { x: 100 + r * Math.cos(theta), y: 100 - r * Math.sin(theta) };
}

function FearGreedGauge({ score }: { score: number }) {
  const R = 80;
  const needle = arcPoint(score, R - 22);

  return (
    <svg viewBox="0 0 200 112" className="mx-auto w-full max-w-64" aria-hidden>
      {FEAR_GREED_BANDS.map((b) => {
        // 구간 사이에 작은 틈을 둔다
        const from = arcPoint(b.from + (b.from === 0 ? 0 : 0.6), R);
        const to = arcPoint(b.to - (b.to === 100 ? 0 : 0.6), R);
        return (
          <path
            key={b.level}
            d={`M ${from.x} ${from.y} A ${R} ${R} 0 0 1 ${to.x} ${to.y}`}
            fill="none"
            strokeWidth={14}
            className={FEAR_GREED_STROKE[b.level]}
          />
        );
      })}
      <line x1={100} y1={100} x2={needle.x} y2={needle.y} strokeWidth={3} strokeLinecap="round" className="stroke-fg" />
      <circle cx={100} cy={100} r={5} className="fill-fg" />
    </svg>
  );
}

/** 0~100 항목 점수 막대 — 50 기준 왼쪽 공포(파랑), 오른쪽 탐욕(빨강) */
function FactorBar({ score }: { score: number }) {
  const width = (Math.abs(score - 50) / 50) * 50;
  return (
    <div className="relative h-1.5 rounded-full bg-surface-2" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
      <div
        className={cn("absolute inset-y-0 rounded-full", score >= 50 ? "left-1/2 bg-danger" : "right-1/2 bg-info")}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function FactorRow({ factor }: { factor: FearGreedFactor }) {
  const level = factor.score == null ? null : fearGreedLevel(factor.score);
  return (
    <li className="space-y-1.5 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-fg">{factor.label}</span>
        {level == null ? (
          <span className="text-xs text-fg-subtle">데이터 없음</span>
        ) : (
          <span className={cn("text-xs font-semibold tabular-nums", FEAR_GREED_TEXT[level])}>
            {factor.score} · {FEAR_GREED_LABEL[level]}
          </span>
        )}
      </div>
      {factor.score != null && <FactorBar score={factor.score} />}
      <p className="text-xs text-fg-muted">
        {factor.value !== "-" && <span className="mr-1.5 tabular-nums text-fg">{factor.value}</span>}
        {factor.reason}
      </p>
    </li>
  );
}

function FearGreedCard({ fearGreed, note }: { fearGreed: FearGreed | null; note: string | null }) {
  if (!fearGreed) {
    return <p className="rounded-card border border-line p-6 text-center text-sm text-fg-subtle">{note ?? "공포·탐욕 지수를 계산하지 못했습니다."}</p>;
  }

  return (
    <section aria-label="공포·탐욕 지수" className="rounded-card border border-line">
      <h3 className="border-b border-line px-3 py-2 text-sm font-semibold text-fg">공포·탐욕 지수</h3>
      <div className="px-3 pt-3 text-center">
        <FearGreedGauge score={fearGreed.score} />
        <p className="-mt-2 text-3xl font-bold tabular-nums text-fg">{fearGreed.score}</p>
        <p className={cn("text-sm font-semibold", FEAR_GREED_TEXT[fearGreed.level])}>{fearGreed.label}</p>
        <p className="mt-0.5 text-[11px] text-fg-subtle">{fearGreed.asOf} 일봉 기준</p>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-left">
          {fearGreed.history.map((h) => {
            const level = h.score == null ? null : fearGreedLevel(h.score);
            return (
              <div key={h.label} className="rounded-control bg-surface-2 px-3 py-1.5">
                <dt className="text-[11px] text-fg-subtle">{h.label}</dt>
                <dd className={cn("text-sm font-semibold tabular-nums", level ? FEAR_GREED_TEXT[level] : "text-fg-subtle")}>
                  {h.score == null || level == null ? "-" : `${h.score} ${FEAR_GREED_LABEL[level]}`}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      <ul className="mt-3 divide-y divide-line border-t border-line">
        {fearGreed.factors.map((f) => (
          <FactorRow key={f.key} factor={f} />
        ))}
      </ul>
      <p className="border-t border-line px-3 py-2 text-[11px] text-fg-subtle">{fearGreed.disclaimer}</p>
    </section>
  );
}

const signedKrw = (v: number) => `${v > 0 ? "+" : ""}${formatKrwCompact(v)}`;
/** 시장 거래대금은 조 단위 한 자리로 짧게 (10.8조) */
const trillions = (v: number) => `${formatNumber(v / 1e12, 1)}조`;

function MarketInvestors({ symbol, name }: { symbol: MarketIndexSymbol; name: string }) {
  const { data: days, error } = usePolling(
    `market-investors:${symbol}`,
    () => getMarketInvestors(symbol),
    INVESTOR_REFRESH_MS,
    "시장 투자자 동향을 불러오지 못했습니다."
  );

  const recent = days?.slice(0, 5) ?? [];
  const sum = (pick: (d: MarketInvestorDay) => number) => recent.reduce((s, d) => s + pick(d), 0);

  return (
    <section aria-label={`${name} 투자자별 순매수`} className="rounded-card border border-line">
      <h3 className="border-b border-line px-3 py-2 text-sm font-semibold text-fg">{name} 투자자별 순매수</h3>
      {error && !days ? (
        <p role="alert" className="p-6 text-center text-sm text-danger-soft-fg">
          {error}
        </p>
      ) : !days ? (
        <Skeleton className="m-3 h-48" />
      ) : days.length === 0 ? (
        <p className="p-6 text-center text-sm text-fg-subtle">매매대금 데이터가 없습니다.</p>
      ) : (
        <div className="space-y-3 p-3">
          <dl className="grid grid-cols-3 gap-2">
            {(
              [
                ["개인", sum((d) => d.individual)],
                ["외국인", sum((d) => d.foreigner)],
                ["기관", sum((d) => d.institution)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-card border border-line bg-surface-2 px-3 py-2">
                <dt className="text-xs text-fg-subtle">
                  {label} {recent.length}일
                </dt>
                <dd className={cn("text-sm font-semibold tabular-nums", TONE_TEXT[changeTone(value)])}>{signedKrw(value)}</dd>
              </div>
            ))}
          </dl>

          <div className="max-h-80 overflow-auto rounded-card border border-line">
            <table className="w-full min-w-[24rem] text-xs tabular-nums">
              <thead className="sticky top-0 bg-surface text-fg-subtle">
                <tr className="border-b border-line">
                  <th className="px-3 py-2 text-left font-normal">일자</th>
                  <th className="px-3 py-2 text-right font-normal">개인</th>
                  <th className="px-3 py-2 text-right font-normal">외국인</th>
                  <th className="px-3 py-2 text-right font-normal">기관</th>
                  <th className="px-3 py-2 text-right font-normal">거래대금</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.date} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-1.5 text-fg-muted">{d.date}</td>
                    {[d.individual, d.foreigner, d.institution].map((v, i) => (
                      <td key={i} className={cn("px-3 py-1.5 text-right", TONE_TEXT[changeTone(v)])}>
                        {signedKrw(v)}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right text-fg">{trillions(d.tradingValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-fg-subtle">순매수 대금(원) 기준. 당일 기록은 장 마감 전까지 잠정치입니다.</p>
        </div>
      )}
    </section>
  );
}

/**
 * 시장 탭 — 지수 차트, 공포·탐욕 지수 상세, 시장 전체 투자자별 순매수.
 * 지수 값은 상단 띠와 같은 폴링 결과(`market`)를 받아 쓴다.
 */
export default function MarketPanel({
  market,
  error,
  index,
  onIndexChange,
}: {
  market: MarketOverview | null;
  error: string | null;
  index: MarketChartSymbol;
  onIndexChange: (index: MarketChartSymbol) => void;
}) {
  if (!market) {
    return error ? (
      <p role="alert" className="p-6 text-center text-sm text-danger-soft-fg">
        {error}
      </p>
    ) : (
      <Skeleton className="m-3 h-80" />
    );
  }

  // 지수 탭 머리의 값 — VIX 는 Cboe 요약에서, 코스피·코스닥은 토스 지수에서
  const current = index === "VIX" ? market.vix : market.indices.find((i) => i.symbol === index);
  const name = INDEX_TABS.find((t) => t.value === index)?.label ?? index;
  const tone = TONE_TEXT[changeTone(current?.change)];

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="tablist" aria-label="지수" className="flex items-center gap-0.5 rounded-control bg-surface-2 p-0.5">
          {INDEX_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={index === t.value}
              onClick={() => onIndexChange(t.value)}
              className={cn(
                "h-7 rounded-control px-3 text-xs font-medium transition",
                index === t.value ? "bg-surface text-fg shadow-card" : "text-fg-muted hover:text-fg"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {current && (
          <p className="flex items-baseline gap-2 tabular-nums">
            <span className={cn("text-xl font-bold", tone)}>{formatNumber(current.value, 2)}</span>
            {current.change != null && (
              <span className={cn("text-sm", tone)}>
                {current.change > 0 ? "▲" : current.change < 0 ? "▼" : ""}
                {formatNumber(Math.abs(current.change), 2)}
                {current.changeRate != null && ` (${formatRate(current.changeRate)})`}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-line">
        <ChartPanel
          kind="index"
          symbol={index}
          dailyOnly={index === "VIX"}
          livePrice={current?.value ?? null}
          liveTime={current?.timestamp ?? null}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <FearGreedCard fearGreed={market.fearGreed} note={market.fearGreedNote} />
        {index === "VIX" ? (
          <VixCard vix={market.vix} note={market.vixNote} />
        ) : (
          <MarketInvestors symbol={index as MarketIndexSymbol} name={name} />
        )}
      </div>
    </div>
  );
}
