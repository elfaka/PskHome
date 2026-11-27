"use client";

import { useState } from "react";

import {
  getTraderActivity,
  getTraderChart,
  getTraderDecisions,
  getTraderEquity,
  getTraderFills,
  getTraderOrders,
  getTraderPerformance,
  getTraderScores,
  getTraderStats,
  traderSetStrategy,
  type ChartInterval,
  type TraderActivity,
  type TraderDecision,
  type TraderPerformanceRow,
  type TraderStatus,
  type TraderStrategyRow,
  type TraderSummary,
} from "@/api/trader";
import Alert from "@/components/ui/Alert";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errorMessage";
import { TONE_TEXT } from "@/lib/stocksim/format";
import { usePolling } from "@/lib/stocksim/usePolling";
import { Select } from "@/components/ui/Field";
import { formatDec, formatKst, formatRatioPct, signOf } from "@/lib/trader/decimal";
import {
  actionLabel,
  actionTone,
  actorLabel,
  CATEGORY_LABEL,
  HORIZON_LABEL,
  PART_LABEL,
  PART_ORDER,
  reasonKo,
  REJECT_TEXT,
  RISK_RESULT,
  splitRiskReason,
  STRATEGY_META,
  strategyLabel,
} from "@/lib/trader/labels";
import { formatSettingValue, settingMeta } from "@/lib/trader/settingsMeta";

import { SymbolText, useSymbolName } from "./names";
import { useStepUp } from "./stepUp";
import {
  EquitySection,
  IndicatorCards,
  RejectionSection,
  ScorePartsCard,
  ScoreTrendSection,
  StatsRow,
  SymbolChartSection,
  UniverseStrip,
} from "./charts";
import { DataTable, Gauge, Kpi, num, Section, Signed, StatusDot, Switch, td, ago } from "./ui";

const SIDE_TEXT: Record<string, string> = { BUY: "매수", SELL: "매도" };

// ── 개요 ─────────────────────────────────────────────────────────────────────

export function OverviewPanel({
  summary,
  status,
  strategies,
  activity,
  onOpen,
}: {
  summary: TraderSummary | null;
  status: TraderStatus | null;
  strategies: TraderStrategyRow[] | null;
  activity: TraderActivity[] | null;
  onOpen: (tab: string) => void;
}) {
  const equity = usePolling("equity", getTraderEquity, 60_000, "평가금액 추이를 불러오지 못했습니다.");
  const stats = usePolling("stats", getTraderStats, 15_000, "오늘 통계를 불러오지 못했습니다.");
  const s = summary;

  // 종목 차트·지표·점수는 같은 종목을 본다
  // 엔진이 지금 보는 종목 (자동 선정이면 그날 고른 종목 + 목록 밖 보유 종목)
  const configured = status?.universe?.watching?.length ? status.universe.watching : status?.settings?.info?.symbols ?? [];
  const names = Object.fromEntries((status?.universe?.symbols ?? []).filter((p) => p.name).map((p) => [p.symbol, p.name!]));
  const [picked, setPicked] = useState<string | null>(null);
  const [barInterval, setBarInterval] = useState<ChartInterval>(60);
  const symbol = picked ?? configured[0] ?? s?.positions[0]?.symbol ?? null;
  const chart = usePolling(
    symbol ? `chart:${symbol}:${barInterval}` : null,
    () => getTraderChart(symbol!, barInterval),
    15_000,
    "종목 차트를 불러오지 못했습니다."
  );
  const scores = usePolling(symbol ? `scores:${symbol}` : null, () => getTraderScores(symbol!), 30_000, "점수 추이를 불러오지 못했습니다.");
  const symbols = chart.data?.symbols.length ? chart.data.symbols : configured;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="총자산" hint={s?.initialCash ? `시작 ${formatDec(s.initialCash)}` : undefined}>
          {formatDec(s?.equity ?? null)}
        </Kpi>
        <Kpi label="오늘 손익" hint={s?.dayStartEquity ? `기준 ${formatDec(s.dayStartEquity)}` : "오늘 기준 없음"}>
          <Signed value={s?.dayPnl ?? null} />
        </Kpi>
        <Kpi label="누적 수익률" hint={s ? `현금 ${formatDec(s.cash)}` : undefined}>
          <Signed value={s?.cumReturn ?? null} digits={2} pct />
        </Kpi>
        <Kpi label="MDD" hint="일별 시작 평가금액 기준">
          <span className={signOf(equity.data?.mdd) === "down" ? TONE_TEXT.down : undefined}>
            {formatRatioPct(equity.data?.mdd ?? null, 2, false)}
          </span>
        </Kpi>
      </div>

      <StatsRow stats={stats.data} />
      {stats.error && <Alert>{stats.error}</Alert>}
      <UniverseStrip universe={status?.universe} selected={symbol} onSelect={setPicked} />

      {/* 화면이 넓어질수록 열이 늘어난다 (lg 2 · xl 3 · 2xl 4). 빈칸은 뒤 카드가 채운다 */}
      <div className="grid grid-flow-row-dense gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <SymbolChartSection
          className="lg:col-span-2 2xl:col-span-3"
          symbol={symbol}
          symbols={symbols}
          interval={barInterval}
          data={chart.data}
          error={chart.error}
          onSymbol={setPicked}
          onInterval={setBarInterval}
          names={names}
        />
        <div className="grid min-w-0 content-start gap-4 lg:col-span-2 lg:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
          <IndicatorCards ind={chart.data?.indicators ?? null} symbol={symbol} />
          <ScorePartsCard scores={scores.data} />
        </div>

        <ScoreTrendSection className="lg:col-span-2" scores={scores.data} error={scores.error} />
        <EquitySection equity={equity.data} current={s?.equity ?? null} error={equity.error} />
        <Section title="리스크">
          <div className="space-y-4">
            <Gauge
              label="하루 손실 한도 사용률"
              ratio={s?.lossUsage ?? null}
              detail={s?.dailyLossLimit ? `한도 ${formatDec(s.dailyLossLimit)}원 · 80% 넘으면 경고` : "한도 정보 없음 (엔진 신호 대기)"}
            />
            <div className="space-y-3">
              <p className="text-xs font-medium text-fg-muted">종목별 투자 비중</p>
              {s?.positions.length ? (
                s.positions.map((p) => (
                  <Gauge
                    key={p.symbol}
                    label={p.symbol}
                    ratio={p.weight ?? null}
                    detail={`보유 한도 대비 ${formatRatioPct(p.limitUsage ?? null, 0, false)} · ${formatDec(p.marketValue)}원`}
                  />
                ))
              ) : (
                <p className="text-xs text-fg-subtle">보유 종목이 없습니다.</p>
              )}
            </div>
          </div>
        </Section>

        <Section
          title="전략"
          className="lg:col-span-2"
          aside={
            <button type="button" className="text-xs text-accent-soft-fg hover:underline" onClick={() => onOpen("strategies")}>
              전체 보기
            </button>
          }
        >
          <StrategyList rows={strategies} status={status} compact />
        </Section>
        <RejectionSection stats={stats.data} error={null} />
        <Section
          title="최근 활동"
          className="xl:col-span-2 2xl:col-span-1"
          aside={
            <button type="button" className="text-xs text-accent-soft-fg hover:underline" onClick={() => onOpen("activity")}>
              전체 보기
            </button>
          }
        >
          <ActivityList items={(activity ?? []).slice(0, 12)} compact />
        </Section>
      </div>

      <PositionsSection summary={s} />
    </div>
  );
}

function PositionsSection({ summary: s }: { summary: TraderSummary | null }) {
  return (
    <Section title="보유 종목" aside={<span className="text-xs text-fg-subtle">미체결 {s ? s.openOrders : "—"}건</span>}>
      <DataTable head={["종목", "수량", "평균단가", "현재가", "평가금액", "비중", "평가손익", "실현손익"]} empty={!!s && s.positions.length === 0}>
        {s?.positions.map((p) => (
          <tr key={p.symbol} className="border-b border-line/60">
            <td className={td}>
              <SymbolText symbol={p.symbol} />
            </td>
            <td className={num}>{formatDec(p.qty)}</td>
            <td className={num}>{formatDec(p.avgPrice)}</td>
            <td className={num} title={formatKst(p.lastPriceAt)}>
              {formatDec(p.lastPrice)}
            </td>
            <td className={num}>{formatDec(p.marketValue)}</td>
            <td className={num}>{formatRatioPct(p.weight ?? null, 1, false)}</td>
            <td className={num}>
              <Signed value={p.unrealizedPnl} />
            </td>
            <td className={num}>
              <Signed value={p.realizedPnl} />
            </td>
          </tr>
        ))}
      </DataTable>
    </Section>
  );
}

// ── 전략 (Uptime Kuma 상태 막대 + 켜기/끄기) ─────────────────────────────────

function tickTone(t: { action: string; riskResult: string | null }): string {
  if (t.riskResult === "APPROVED") return "bg-success";
  if (t.riskResult === "REJECTED") return "bg-warning";
  if (t.riskResult === "STRATEGY_OFF") return "bg-fg-subtle";
  if (t.action === "BUY" || t.action === "SELL" || t.action === "EXIT") return "bg-accent";
  return "bg-surface-2 border border-line";
}

export function StrategyList({
  rows,
  status,
  compact = false,
  onChanged,
}: {
  rows: TraderStrategyRow[] | null;
  status: TraderStatus | null;
  compact?: boolean;
  onChanged?: () => void;
}) {
  const { guarded } = useStepUp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const now = status ? new Date(status.serverTime).getTime() : null;

  async function toggle(id: string, enabled: boolean) {
    setBusy(id);
    setError(null);
    try {
      // 끄기는 바로 (위험을 줄이는 방향), 켜기는 2단계 인증 후
      const done = enabled ? await guarded(() => traderSetStrategy(id, true)) : (await traderSetStrategy(id, false), true);
      if (done) {
        setOptimistic((o) => ({ ...o, [id]: enabled }));
        onChanged?.();
      }
    } catch (e) {
      setError(errorMessage(e, "전략 상태를 바꾸지 못했습니다."));
    } finally {
      setBusy(null);
    }
  }

  if (!rows) return <p className="text-xs text-fg-subtle">불러오는 중…</p>;
  if (rows.length === 0) return <p className="text-xs text-fg-subtle">엔진이 아직 전략 정보를 남기지 않았습니다.</p>;

  return (
    <div className="space-y-2">
      {error && <Alert>{error}</Alert>}
      <ul className="divide-y divide-line/60">
        {rows.map((r) => {
          const enabled = optimistic[r.id] ?? r.enabled;
          const halted = status?.killswitch.halted;
          const tone = !enabled ? "off" : halted ? "error" : status?.engine.state === "running" ? "ok" : "warn";
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="flex min-w-40 items-center gap-2">
                <StatusDot tone={tone} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">
                    {strategyLabel(r.id)} <span className="text-[11px] font-normal text-fg-subtle">{r.id}</span>
                  </p>
                  <p className="text-[11px] text-fg-subtle">
                    {r.shadow ? "그림자 (주문 없이 신호·성과만 기록)" : "주문 전략"} · 마지막 판단 {now == null ? "—" : ago(r.lastDecisionAt, now)}
                  </p>
                  {!compact && STRATEGY_META[r.id] && (
                    <p className="mt-0.5 max-w-xl text-[11px] text-fg-muted">{STRATEGY_META[r.id].description}</p>
                  )}
                  {compact && STRATEGY_META[r.id] && <p className="mt-0.5 truncate text-[11px] text-fg-muted">{STRATEGY_META[r.id].summary}</p>}
                </div>
              </div>
              {/* 좁은 화면에서는 한 줄을 다 쓰고, 넘치는 옛 판단은 왼쪽에서 잘린다 (최근 것이 오른쪽) */}
              <div className="order-last flex min-w-0 basis-full items-end justify-end gap-0.5 overflow-hidden sm:order-none sm:basis-0 sm:flex-1" aria-label={`${strategyLabel(r.id)} 최근 판단`}>
                {r.recent.slice(compact ? -24 : -40).map((t, i) => (
                  <span
                    key={`${t.ts}-${i}`}
                    className={cn("h-5 w-1.5 shrink-0 rounded-sm", tickTone(t))}
                    title={`${formatKst(t.ts)} ${t.symbol} ${t.action}${t.riskResult ? ` · ${t.riskResult}` : ""}`}
                  />
                ))}
              </div>
              <dl className="grid grid-cols-4 gap-3 text-center text-[11px] text-fg-subtle">
                <div>
                  <dt>신호</dt>
                  <dd className="text-sm tabular-nums text-fg">{r.today.signals}</dd>
                </div>
                <div>
                  <dt>주문</dt>
                  <dd className="text-sm tabular-nums text-fg">{r.today.orders}</dd>
                </div>
                <div>
                  <dt>체결</dt>
                  <dd className="text-sm tabular-nums text-fg">{r.today.fills}</dd>
                </div>
                <div>
                  <dt>거부</dt>
                  <dd className="text-sm tabular-nums text-fg">{r.today.rejected}</dd>
                </div>
              </dl>
              <Switch
                checked={enabled}
                disabled={busy === r.id}
                label={`${strategyLabel(r.id)} ${enabled ? "끄기" : "켜기"}`}
                onChange={(next) => void toggle(r.id, next)}
              />
            </li>
          );
        })}
      </ul>
      {!compact && (
        <p className="text-[11px] text-fg-subtle">
          막대: 초록 주문 승인 · 노랑 위험 관리 거부 · 파랑 그림자 신호 · 회색 꺼짐 · 빈칸 관망. 꺼도 손절·목표가·장마감 청산과 매도 신호는 계속 동작합니다.
          켜기는 2단계 인증이 필요합니다.
        </p>
      )}
    </div>
  );
}

// ── 보유·주문 ────────────────────────────────────────────────────────────────

const OPEN = new Set(["PENDING_NEW", "NEW", "PARTIALLY_FILLED", "PENDING_CANCEL"]);

export function TradesPanel({ summary }: { summary: TraderSummary | null }) {
  const [view, setView] = useState<"orders" | "fills">("orders");
  const orders = usePolling("orders", () => getTraderOrders(50), 10_000, "주문을 불러오지 못했습니다.");
  const fills = usePolling("fills", () => getTraderFills(50), 10_000, "체결을 불러오지 못했습니다.");
  const open = (orders.data ?? []).filter((o) => OPEN.has(o.status));

  return (
    <div className="space-y-4">
      <PositionsSection summary={summary} />
      <Section title="미체결 주문">
        <DataTable head={["시각", "종목", "구분", "수량", "체결", "상태", "전략"]} empty={orders.data != null && open.length === 0}>
          {open.map((o) => (
            <tr key={o.clientOrderId} className="border-b border-line/60">
              <td className={td}>{formatKst(o.createdAt)}</td>
              <td className={td}>
                <SymbolText symbol={o.symbol} />
              </td>
              <td className={cn(td, o.side === "BUY" ? TONE_TEXT.up : TONE_TEXT.down)}>{SIDE_TEXT[o.side] ?? o.side}</td>
              <td className={num}>{formatDec(o.qty)}</td>
              <td className={num}>{formatDec(o.filledQty)}</td>
              <td className={td}>{o.status}</td>
              <td className={cn(td, "text-fg-muted")}>{strategyLabel(o.strategyId)}</td>
            </tr>
          ))}
        </DataTable>
      </Section>
      <Section
        title="거래 내역"
        aside={
          <div role="tablist" aria-label="거래 내역 종류" className="flex gap-1 rounded-control bg-surface-2 p-0.5 text-xs">
            {(["orders", "fills"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn("rounded-control px-2.5 py-1", view === v ? "bg-surface text-fg shadow-card" : "text-fg-muted")}
              >
                {v === "orders" ? "주문" : "체결"}
              </button>
            ))}
          </div>
        }
      >
        {(view === "orders" ? orders.error : fills.error) && (
          <Alert className="mb-2">{view === "orders" ? orders.error : fills.error}</Alert>
        )}
        {view === "orders" ? (
          <DataTable head={["시각", "종목", "구분", "수량", "체결·평균가", "상태", "전략", "사유"]} empty={orders.data?.length === 0}>
            {orders.data?.map((o) => (
              <tr key={o.clientOrderId} className="border-b border-line/60">
                <td className={td}>{formatKst(o.createdAt)}</td>
                <td className={td}>
                <SymbolText symbol={o.symbol} />
              </td>
                <td className={cn(td, o.side === "BUY" ? TONE_TEXT.up : TONE_TEXT.down)}>{SIDE_TEXT[o.side] ?? o.side}</td>
                <td className={num}>{formatDec(o.qty)}</td>
                <td className={num}>
                  {formatDec(o.filledQty)}
                  {o.avgFillPrice && <span className="text-fg-subtle"> @{formatDec(o.avgFillPrice)}</span>}
                </td>
                <td className={td}>
                  <Badge tone={o.status === "FILLED" ? "success" : o.status === "REJECTED" ? "warning" : "neutral"}>{o.status}</Badge>
                </td>
                <td className={cn(td, "text-fg-muted")}>{strategyLabel(o.strategyId)}</td>
                <td className={cn(td, "max-w-64 truncate text-fg-muted")} title={o.rejectReason ?? undefined}>
                  {o.rejectReason ?? "—"}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <DataTable head={["시각", "종목", "구분", "수량", "가격", "수수료", "세금"]} empty={fills.data?.length === 0}>
            {fills.data?.map((f) => (
              <tr key={f.execId} className="border-b border-line/60">
                <td className={td}>{formatKst(f.ts)}</td>
                <td className={td}>
                <SymbolText symbol={f.symbol} />
              </td>
                <td className={cn(td, f.side === "BUY" ? TONE_TEXT.up : TONE_TEXT.down)}>{SIDE_TEXT[f.side] ?? f.side}</td>
                <td className={num}>{formatDec(f.qty)}</td>
                <td className={num}>{formatDec(f.price)}</td>
                <td className={num}>{formatDec(f.commission)}</td>
                <td className={num}>{formatDec(f.tax)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
    </div>
  );
}

// ── 판단·성과 ────────────────────────────────────────────────────────────────

const KST_HM = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
const KST_MD = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" });
const KST_DAY = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" });
const KST_HMS = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function hm(iso: string | null | undefined): string {
  return iso ? KST_HM.format(new Date(iso)) : "—";
}

const ACTION_BADGE: Record<string, BadgeTone> = { up: "danger", down: "info", flat: "neutral" };

function ActionBadge({ action }: { action: string }) {
  return <Badge tone={ACTION_BADGE[actionTone(action)]}>{actionLabel(action)}</Badge>;
}

function StrategyCell({ id, shadow }: { id: string; shadow?: boolean }) {
  const meta = STRATEGY_META[id];
  return (
    <div className="min-w-0" title={meta?.summary}>
      <span className="text-fg">{strategyLabel(id)}</span>
      {shadow && (
        <Badge tone="accent" className="ml-1">
          그림자
        </Badge>
      )}
      {meta?.kind === "규칙" && <span className="ml-1 text-[10px] text-fg-subtle">규칙</span>}
    </div>
  );
}

/** 점수 (가격·맥락·이슈 쌓은 막대) */
function ScoreCell({ d }: { d: TraderDecision }) {
  if (d.score == null) return <span className="text-fg-subtle">—</span>;
  const c = d.components ?? {};
  const seg = [
    { v: c.price?.points, cls: "bg-series-1", label: "가격" },
    { v: c.context?.points, cls: "bg-series-2", label: "맥락" },
    { v: c.issue?.points, cls: "bg-series-3", label: "이슈" },
  ];
  return (
    <div className="w-24">
      <div className="flex items-baseline justify-between">
        <span className="font-medium tabular-nums text-fg">{formatDec(d.score)}점</span>
      </div>
      <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
        {seg.map((s) => (
          <span key={s.label} className={s.cls} style={{ width: `${Math.max(0, Math.min(100, Number(s.v ?? 0)))}%` }} />
        ))}
      </div>
      <p className="mt-0.5 text-[10px] text-fg-subtle tabular-nums">
        {seg.map((s) => `${s.label} ${s.v != null ? formatDec(s.v) : "—"}`).join(" · ")}
      </p>
    </div>
  );
}

function RiskCell({ d }: { d: TraderDecision }) {
  if (!d.riskResult) return <span className="text-fg-subtle">주문 의도 없음</span>;
  const meta = RISK_RESULT[d.riskResult] ?? { label: d.riskResult, tone: "neutral" as const };
  const { label, message } = splitRiskReason(d.riskReason);
  const showMsg = d.riskResult === "REJECTED" || d.riskResult === "DUPLICATE";
  return (
    <div className="min-w-44 max-w-60 whitespace-normal">
      <Badge tone={meta.tone}>{meta.label}</Badge>
      {d.riskResult === "REJECTED" && label && <p className="mt-0.5 font-medium text-warning-soft-fg">{label}</p>}
      {showMsg && message && <p className="mt-0.5 text-fg-subtle">{message}</p>}
    </div>
  );
}

function LevelsCell({ d }: { d: TraderDecision }) {
  if (!d.entryPrice) return <span className="text-fg-subtle">—</span>;
  return (
    <div className="tabular-nums">
      <p className="text-fg">{formatDec(d.entryPrice)}</p>
      <p className="text-[11px] text-fg-subtle">
        손절 <span className={TONE_TEXT.down}>{formatDec(d.stopLoss)}</span> · 목표 <span className={TONE_TEXT.up}>{formatDec(d.takeProfit)}</span>
      </p>
      {d.riskReward && <p className="text-[11px] text-fg-subtle">손익비 {formatDec(d.riskReward, 2)}</p>}
    </div>
  );
}

function DecisionDetail({ d }: { d: TraderDecision }) {
  const parts = d.parts ?? null;
  const ma = d.ma ?? null;
  const { label, message } = splitRiskReason(d.riskReason);
  return (
    <div className="grid gap-4 py-1 text-xs md:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <p className="text-[11px] font-medium text-fg-muted">판단 근거</p>
        <p className="text-fg">{reasonKo(d.reason)}</p>
        {ma && (
          <p className="text-fg-muted tabular-nums">
            짧은 이동평균 {formatDec(ma.fast, 1)} · 긴 이동평균 {formatDec(ma.slow, 1)} · 차이 <Signed value={ma.diff} digits={1} />
          </p>
        )}
        {parts && (
          <ul className="space-y-1.5">
            {PART_ORDER.filter((k) => parts[k]).map((k) => {
              const p = parts[k];
              const pct = Math.max(0, Math.min(100, (Number(p.points ?? 0) / Math.max(Number(p.max ?? 1), 1)) * 100));
              return (
                <li key={k} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2">
                  <span className={p.available ? "text-fg-muted" : "text-fg-subtle"}>{PART_LABEL[k]}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                        <div className={cn("h-full rounded-full", p.available ? "bg-accent" : "bg-fg-subtle/40")} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="tabular-nums text-fg">
                        {formatDec(p.points)}
                        <span className="text-fg-subtle">/{formatDec(p.max)}</span>
                      </span>
                    </div>
                    <p className={cn("truncate", p.available ? "text-fg-muted" : "text-fg-subtle")} title={p.note}>
                      {p.available ? p.note : `사용 안 함 — ${p.note}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {d.invalidation && d.invalidation.length > 0 && (
          <p className="text-fg-muted">
            <span className="text-fg-subtle">이렇게 되면 판단 무효:</span> {d.invalidation.join(" · ")}
          </p>
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <p className="text-[11px] font-medium text-fg-muted">위험 관리</p>
        <p className="text-fg">
          {RISK_RESULT[d.riskResult ?? ""]?.label ?? d.riskResult ?? "주문 의도 없음"}
          {label && <span className="text-warning-soft-fg"> · {label}</span>}
        </p>
        {message && <p className="text-fg-muted">{message}</p>}
        {d.entryPrice && (
          <p className="text-fg-muted tabular-nums">
            진입 기준가 {formatDec(d.entryPrice)} · 손절 {formatDec(d.stopLoss)} · 목표 {formatDec(d.takeProfit)}
            {d.riskReward && ` · 비용 차감 손익비 ${formatDec(d.riskReward, 2)}`}
          </p>
        )}
        <p className="text-fg-subtle">
          봉 {formatKst(d.barTs)} · 판단 {formatKst(d.ts)}
          {d.validUntil && ` · 유효 ~${hm(d.validUntil)}`}
        </p>
        {d.clientOrderId && <p className="break-all text-fg-subtle">주문 번호 {d.clientOrderId}</p>}
        <p className="text-fg-subtle">{STRATEGY_META[d.strategyId]?.summary}</p>
      </div>
    </div>
  );
}

function DecisionRow({ d }: { d: TraderDecision }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className={cn("border-b border-line/60 align-top", open && "bg-surface-2/50")}>
        <td className={td}>
          <p className="font-medium tabular-nums text-fg">{hm(d.barTs)}</p>
          <p className="text-[10px] text-fg-subtle tabular-nums">{d.barTs ? KST_MD.format(new Date(d.barTs)) : ""}</p>
        </td>
        <td className={td}>
          <SymbolText symbol={d.symbol} />
        </td>
        <td className={td}>
          <StrategyCell id={d.strategyId} shadow={d.shadow} />
        </td>
        <td className={td}>
          <ActionBadge action={d.action} />
        </td>
        <td className={td}>
          <ScoreCell d={d} />
        </td>
        <td className={td}>
          <RiskCell d={d} />
        </td>
        <td className={num}>
          <LevelsCell d={d} />
        </td>
        <td className={cn(td, "min-w-56 max-w-[24rem] whitespace-normal text-fg")}>{reasonKo(d.reason)}</td>
        <td className={td}>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="rounded-control px-2 py-1 text-[11px] text-accent-soft-fg hover:bg-surface-hover"
          >
            {open ? "접기" : "자세히"}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line/60 bg-surface-2/50">
          <td colSpan={9} className="px-3 pb-3">
            <DecisionDetail d={d} />
          </td>
        </tr>
      )}
    </>
  );
}

const STRATEGY_FILTERS = ["", ...Object.keys(STRATEGY_META)];

export function DecisionsPanel() {
  const [signalsOnly, setSignalsOnly] = useState(true);
  const [strategy, setStrategy] = useState("");
  const decisions = usePolling(
    `decisions:${signalsOnly}:${strategy}`,
    () => getTraderDecisions({ signalsOnly, limit: 80, strategy: strategy || undefined }),
    10_000,
    "판단 기록을 불러오지 못했습니다."
  );
  const perf = usePolling("perf", getTraderPerformance, 60_000, "신호 성과를 불러오지 못했습니다.");
  return (
    <div className="space-y-4">
      <Section
        title="판단 기록"
        aside={
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 whitespace-nowrap text-fg-muted">
              전략
              <Select value={strategy} onChange={(e) => setStrategy(e.target.value)} className="h-8 w-auto py-0 text-xs" aria-label="전략">
                {STRATEGY_FILTERS.map((id) => (
                  <option key={id || "all"} value={id}>
                    {id ? strategyLabel(id) : "전체"}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex items-center gap-1.5 text-fg-muted">
              <input type="checkbox" checked={signalsOnly} onChange={(e) => setSignalsOnly(e.target.checked)} />
              매수·매도·청산 신호만
            </label>
          </div>
        }
      >
        <p className="mb-2 text-[11px] text-fg-subtle">
          1분봉이 닫힐 때마다 전략이 내린 판단입니다. 신호가 나면 위험 관리가 주문을 승인하거나 막습니다. &ldquo;자세히&rdquo;를 누르면 점수 항목·근거를 봅니다.
        </p>
        {decisions.error && <Alert className="mb-2">{decisions.error}</Alert>}
        <DataTable head={["시각", "종목", "전략", "신호", "점수", "위험 관리", "진입·손절·목표", "판단 사유", ""]} empty={decisions.data?.length === 0}>
          {decisions.data?.map((d) => <DecisionRow key={d.id} d={d} />)}
        </DataTable>
      </Section>
      <PerformanceSection rows={perf.data} error={perf.error} />
    </div>
  );
}

/** 신호 성과 — 전략·신호별 카드, 기간별 평균 수익률·승률·최대 유리/불리 */
function PerformanceSection({ rows, error }: { rows: TraderPerformanceRow[] | null; error: string | null }) {
  const groups = new Map<string, TraderPerformanceRow[]>();
  for (const r of rows ?? []) {
    const k = `${r.strategyId}|${r.action}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const all = (rows ?? []).filter((r) => r.count > 0);
  const maxAbs = Math.max(0.001, ...all.map((r) => Math.abs(Number(r.avgReturnPct ?? 0))));
  return (
    <Section title="신호 성과">
      <p className="mb-3 rounded-control bg-surface-2 px-3 py-2 text-[11px] text-fg-muted">
        신호가 난 뒤 5분·15분·30분·장마감 시점에 가격이 <b className="font-medium text-fg">신호 방향으로</b> 얼마나 움직였는지입니다. 매수는 오르면 +,
        매도·청산은 내리면 + 입니다. 승률은 + 로 끝난 비율, 최대 유리·불리는 그 사이 가장 좋았던·나빴던 폭의 평균입니다. 주문 여부와 상관없이 모든 신호를 평가합니다.
      </p>
      {error && <Alert className="mb-2">{error}</Alert>}
      {rows && groups.size === 0 && <p className="py-4 text-center text-xs text-fg-subtle">평가할 신호가 아직 없습니다.</p>}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {[...groups.entries()].map(([key, list]) => {
          const [sid, action] = key.split("|");
          const done = list.reduce((a, r) => a + r.count, 0);
          const pending = list.reduce((a, r) => a + r.pending, 0);
          return (
            <figure key={key} className="min-w-0 rounded-card border border-line p-3">
              <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-fg">
                  {strategyLabel(sid)} <ActionBadge action={action} />
                </span>
                <span className="text-[11px] text-fg-subtle tabular-nums">
                  평가 {done}건{pending ? ` · 대기 ${pending}건` : ""}
                </span>
              </figcaption>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[11px] text-fg-subtle">
                    <th scope="col" className="py-1 font-medium">기간</th>
                    <th scope="col" className="py-1 font-medium">평균 수익률</th>
                    <th scope="col" className="py-1 text-right font-medium">승률</th>
                    <th scope="col" className="py-1 text-right font-medium">최대 유리 / 불리</th>
                    <th scope="col" className="py-1 text-right font-medium">건수</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const v = Number(r.avgReturnPct ?? 0);
                    const w = r.count ? (Math.abs(v) / maxAbs) * 50 : 0;
                    const up = signOf(r.avgReturnPct) === "up";
                    const win = Math.max(0, Math.min(100, Number(r.winRate ?? 0) * 100));
                    return (
                      <tr key={r.horizon} className="border-t border-line/60">
                        <td className="py-1.5 text-fg-muted">{HORIZON_LABEL[r.horizon] ?? r.horizon}</td>
                        <td className="py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="relative h-2.5 w-16 shrink-0" aria-hidden>
                              <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                              <span
                                className={cn("absolute inset-y-0 rounded-sm", up ? "left-1/2 bg-danger" : "right-1/2 bg-info")}
                                style={{ width: `${w}%` }}
                              />
                            </span>
                            {r.count ? <Signed value={r.avgReturnPct} digits={2} pct /> : <span className="text-fg-subtle">—</span>}
                          </div>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {r.count ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                                <span className="block h-full rounded-full bg-accent" style={{ width: `${win}%` }} />
                              </span>
                              {formatRatioPct(r.winRate, 0, false)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {r.count ? (
                            <>
                              <span className={TONE_TEXT.up}>{formatRatioPct(r.avgMfePct, 2)}</span>
                              <span className="text-fg-subtle"> / </span>
                              <span className={TONE_TEXT.down}>{formatRatioPct(r.avgMaePct, 2)}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-fg-muted">
                          {r.count}
                          {r.pending ? <span className="text-fg-subtle"> +{r.pending}</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </figure>
          );
        })}
      </div>
    </Section>
  );
}

// ── 활동 로그 ────────────────────────────────────────────────────────────────

const LEVEL_TEXT: Record<TraderActivity["level"], string> = { error: "오류", warn: "경고", info: "정보" };
const LEVEL_BAR: Record<TraderActivity["level"], string> = { error: "bg-danger", warn: "bg-warning", info: "bg-line-strong" };
const CATEGORY_TONE: Record<string, BadgeTone> = {
  trade: "success",
  order: "neutral",
  risk: "warning",
  control: "accent",
  settings: "info",
  universe: "accent",
  system: "neutral",
  data: "warning",
};

/** 옛 백엔드(제목 없음)도 보여준다 */
function categoryOf(a: TraderActivity): string {
  if (a.category) return a.category;
  return a.source === "fill" ? "trade" : a.source === "order" ? "order" : "system";
}

type Run = { head: TraderActivity; items: TraderActivity[] };

/** 같은 내용이 연달아 나오면 (위험 관리 거부가 1분마다 쌓이는 경우 등) 한 줄로 묶는다 */
function groupRuns(items: TraderActivity[], enabled: boolean): Run[] {
  const out: Run[] = [];
  for (const a of items) {
    const last = out[out.length - 1];
    if (enabled && last && a.groupKey && last.head.groupKey === a.groupKey) last.items.push(a);
    else out.push({ head: a, items: [a] });
  }
  return out;
}

function dayKey(iso: string | null): string {
  return iso ? KST_DAY.format(new Date(iso)) : "—";
}

function DiffList({ diff }: { diff: NonNullable<TraderActivity["diff"]> }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-1.5">
      {diff.map((c) => {
        const meta = settingMeta(c.key);
        return (
          <li key={c.key} className="rounded-control border border-line bg-surface-2 px-2 py-0.5 text-[11px] tabular-nums">
            <span className="text-fg-muted">{meta?.label ?? c.key}</span>{" "}
            <span className="text-fg-subtle line-through">{formatSettingValue(meta, c.before)}</span>
            <span className="mx-1 text-fg-subtle">→</span>
            <span className="text-fg">{formatSettingValue(meta, c.after)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ActivityRow({ run, compact }: { run: Run; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const a = run.head;
  const nameOf = useSymbolName();
  const n = run.items.length;
  const oldest = run.items[n - 1];
  const cat = categoryOf(a);
  let title = a.title ?? a.message;
  if (a.code) title = `${title} — ${REJECT_TEXT[a.code] ?? a.code}`;
  let detail = a.detail ?? null;
  if (a.category === "universe" && detail) {
    detail = detail
      .split(",")
      .map((s) => s.trim())
      .map((s) => (nameOf(s) ? `${nameOf(s)}(${s})` : s))
      .join(", ");
  }
  const actor = actorLabel(a.by);
  return (
    <li className="flex min-w-0 gap-3 py-2">
      <div className="w-16 shrink-0 text-right tabular-nums">
        <p className="text-xs text-fg">{a.ts ? KST_HMS.format(new Date(a.ts)) : "—"}</p>
        {n > 1 && oldest.ts && <p className="text-[10px] text-fg-subtle">~{KST_HM.format(new Date(oldest.ts))}부터</p>}
      </div>
      <span className={cn("w-1 shrink-0 rounded-full", LEVEL_BAR[a.level])} aria-label={LEVEL_TEXT[a.level]} role="img" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge tone={CATEGORY_TONE[cat] ?? "neutral"}>{CATEGORY_LABEL[cat] ?? cat}</Badge>
          <span className="text-sm font-medium text-fg">{title}</span>
          {a.symbol && <SymbolText symbol={a.symbol} className="text-xs" />}
          {a.strategyId && <span className="text-xs text-fg-muted">{strategyLabel(a.strategyId)}</span>}
          {n > 1 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] tabular-nums text-fg-muted hover:bg-surface-hover"
            >
              같은 내용 {n}번 {open ? "접기" : "펼치기"}
            </button>
          )}
          {actor && !compact && <span className="ml-auto text-[11px] text-fg-subtle">{actor}</span>}
        </div>
        {detail && <p className={cn("mt-0.5 text-xs text-fg-muted", compact ? "truncate" : "break-words")}>{detail}</p>}
        {!compact && a.diff && a.diff.length > 0 && <DiffList diff={a.diff} />}
        {open && (
          <ol className="mt-1 space-y-0.5 border-l border-line pl-3 text-[11px] text-fg-subtle">
            {run.items.map((x) => (
              <li key={x.id} className="tabular-nums">
                {x.ts ? KST_HMS.format(new Date(x.ts)) : "—"} · {x.detail ?? x.message}
              </li>
            ))}
          </ol>
        )}
      </div>
    </li>
  );
}

export function ActivityList({ items, compact = false, grouped = true }: { items: TraderActivity[]; compact?: boolean; grouped?: boolean }) {
  if (items.length === 0) return <p className="py-4 text-center text-xs text-fg-subtle">기록이 없습니다.</p>;
  const runs = groupRuns(items, grouped);
  const days: { day: string; runs: Run[] }[] = [];
  for (const r of runs) {
    const d = dayKey(r.head.ts);
    const last = days[days.length - 1];
    if (last && last.day === d) last.runs.push(r);
    else days.push({ day: d, runs: [r] });
  }
  return (
    <div className="space-y-3" aria-label="활동 로그" role="list">
      {days.map((g) => (
        <div key={g.day} role="listitem">
          {!compact && <p className="sticky top-0 z-10 border-b border-line bg-surface py-1 text-[11px] font-medium text-fg-muted">{g.day}</p>}
          <ol className="divide-y divide-line/50">
            {g.runs.map((r) => (
              <ActivityRow key={r.head.id} run={r} compact={compact} />
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

const CATEGORY_FILTERS = ["trade", "order", "risk", "control", "settings", "universe", "system", "data"] as const;

export function ActivityPanel() {
  const [level, setLevel] = useState<"all" | TraderActivity["level"]>("all");
  const [category, setCategory] = useState<string>("all");
  const [grouped, setGrouped] = useState(true);
  const activity = usePolling("activity:200", () => getTraderActivity(200), 10_000, "활동 로그를 불러오지 못했습니다.");
  const all = activity.data ?? [];
  const items = all.filter((a) => (level === "all" || a.level === level) && (category === "all" || categoryOf(a) === category));
  const count = (l: TraderActivity["level"]) => all.filter((a) => a.level === l).length;
  const cats = CATEGORY_FILTERS.filter((c) => all.some((a) => categoryOf(a) === c));
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-2.5 py-0.5",
      active ? "border-accent bg-accent-soft text-accent-soft-fg" : "border-line text-fg-muted hover:bg-surface-hover"
    );
  return (
    <Section title="활동 로그">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div role="group" aria-label="수준" className="flex flex-wrap gap-1">
          {(["all", "error", "warn", "info"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)} className={chip(level === l)}>
              {l === "all" ? "전체" : `${LEVEL_TEXT[l]} ${count(l)}`}
            </button>
          ))}
        </div>
        <div role="group" aria-label="종류" className="flex flex-wrap gap-1">
          <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")} className={chip(category === "all")}>
            모든 종류
          </button>
          {cats.map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={chip(category === c)}>
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-fg-muted">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          같은 내용 묶기
        </label>
      </div>
      {activity.error && <Alert className="mb-2">{activity.error}</Alert>}
      <ActivityList items={items} grouped={grouped} />
    </Section>
  );
}
