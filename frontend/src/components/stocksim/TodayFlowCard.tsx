"use client";

import { getIntradayFlows, type IntradayFlowPoint } from "@/api/stockSim";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { flowConsensus, flowTurn, recentDirection, type FlowConsensus } from "@/lib/stocksim/flowTrend";
import { changeTone, formatClock, formatPercent, formatShares, TONE_TEXT } from "@/lib/stocksim/format";
import { usePolling } from "@/lib/stocksim/usePolling";

/** 백엔드는 1분 캐시 + 장중 5분마다 수집 */
const REFRESH_MS = 2 * 60_000;

const hhmm = (iso: string) => formatClock(iso).slice(0, 5);
const signed = (v: number) => `${v > 0 ? "+" : ""}${formatShares(v)}`;

const CONSENSUS: Record<FlowConsensus, { label: string; tone: "danger" | "info" | "neutral" }> = {
  bothBuy: { label: "쌍끌이 매수", tone: "danger" },
  bothSell: { label: "쌍끌이 매도", tone: "info" },
  mixed: { label: "수급 엇갈림", tone: "neutral" },
};

const ROWS = [
  { key: "foreigner", label: "외국인" },
  { key: "institution", label: "기관" },
] as const;

/** 오늘 흐름 미니 그래프 (0 선은 범위 안일 때만) */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="w-20 shrink-0" aria-hidden />;
  const W = 80;
  const H = 24;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => 2 + ((max - v) / span) * (H - 4);
  const last = values[values.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-6 w-20 shrink-0" aria-hidden>
      {min <= 0 && max >= 0 && <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-line-strong" strokeDasharray="2 2" />}
      <polyline
        points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        className={last >= 0 ? "stroke-danger" : "stroke-info"}
      />
    </svg>
  );
}

/** "▲ 늘어나는 중 · 오늘 최고" 처럼 방향 + 고점 대비 */
function directionText(values: number[], labels: string[]): { text: string; tone: "up" | "down" | "flat" } | null {
  const dir = recentDirection(values);
  if (!dir) return null;

  const head = dir === "up" ? "▲ 늘어나는 중" : dir === "down" ? "▼ 줄어드는 중" : "– 변화 없음";
  const turn = flowTurn(values);
  let tail = "";
  if (turn?.kind === "high") tail = "오늘 최고";
  else if (turn?.kind === "low") tail = "오늘 최저";
  else if (turn?.kind === "belowPeak") tail = `${labels[turn.index]} 고점 대비 ${signed(turn.change)}`;

  return { text: tail ? `${head} · ${tail}` : head, tone: dir };
}

function Row({
  label,
  values,
  labels,
  volume,
}: {
  label: string;
  values: number[];
  labels: string[];
  volume: number | null;
}) {
  const net = values[values.length - 1];
  const share = volume && volume > 0 ? Math.abs(net) / volume : null;
  const dir = directionText(values, labels);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
      <span className="w-10 shrink-0 font-medium text-fg">{label}</span>
      <span className={cn("w-32 shrink-0 font-semibold tabular-nums", TONE_TEXT[changeTone(net)])}>
        {net > 0 ? "순매수" : net < 0 ? "순매도" : "보합"} {signed(net)}주
      </span>
      {share != null && (
        <span className="shrink-0 text-xs tabular-nums text-fg-muted">
          거래량의 {share < 0.0005 ? "0.1% 미만" : formatPercent(share, 1)}
        </span>
      )}
      <Sparkline values={values} />
      {dir && <span className={cn("min-w-0 text-xs", TONE_TEXT[dir.tone])}>{dir.text}</span>}
    </li>
  );
}

/**
 * 오늘 외국인·기관 수급을 한눈에 — 결론 배지(쌍끌이 매수/매도/엇갈림) + 투자자별 한 줄.
 * 국내 종목에서만 쓴다. `volume` 은 오늘 거래량(주).
 */
export default function TodayFlowCard({ symbol, volume }: { symbol: string; volume: number | null }) {
  const { data, error } = usePolling(symbol, () => getIntradayFlows(symbol), REFRESH_MS, "오늘 수급을 불러오지 못했습니다.");
  const points: IntradayFlowPoint[] = data?.points ?? [];
  const latest = points[points.length - 1];

  return (
    <section aria-label="오늘 수급" className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-fg">오늘 수급</h2>
        {latest && (
          <Badge tone={CONSENSUS[flowConsensus(latest.foreigner, latest.institution)].tone}>
            {CONSENSUS[flowConsensus(latest.foreigner, latest.institution)].label}
          </Badge>
        )}
        {latest && <span className="ml-auto text-[11px] text-fg-subtle">{hhmm(latest.at)} 잠정</span>}
      </div>

      {error && !data ? (
        <p className="py-1.5 text-xs text-danger-soft-fg">{error}</p>
      ) : !data ? (
        <Skeleton className="mt-1 h-14" />
      ) : !latest ? (
        <p className="py-1.5 text-xs text-fg-subtle">
          오늘 잠정치 없음{data.latestDate ? ` · 마지막 기록 ${data.latestDate.slice(5).replace("-", "/")}` : ""}
        </p>
      ) : (
        <ul className="divide-y divide-line/60">
          {ROWS.map((r) => (
            <Row
              key={r.key}
              label={r.label}
              values={points.map((p) => p[r.key])}
              labels={points.map((p) => hhmm(p.at))}
              volume={volume}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
