"use client";

import { useState } from "react";

import {
  getTraderActivity,
  getTraderDecisions,
  getTraderEquity,
  getTraderFills,
  getTraderOrders,
  getTraderPerformance,
  traderSetStrategy,
  type ComponentRecord,
  type TraderActivity,
  type TraderDecision,
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
import { formatDec, formatKst, formatRatioPct, signOf } from "@/lib/trader/decimal";

import { useStepUp } from "./stepUp";
import { DataTable, EquityChart, Gauge, Kpi, num, Section, Signed, StatusDot, Switch, td, ago } from "./ui";

const ACTION_TONE: Record<string, BadgeTone> = { BUY: "danger", SELL: "info", EXIT: "info", HOLD: "neutral", WAIT: "neutral" };
const RISK_TONE: Record<string, BadgeTone> = {
  APPROVED: "success",
  REJECTED: "warning",
  DUPLICATE: "neutral",
  SHADOW: "accent",
  STRATEGY_OFF: "neutral",
};
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
  const s = summary;
  const points = [
    ...(equity.data?.points ?? []).map((p) => ({ label: p.date.slice(5), value: p.equity })),
    ...(s?.equity ? [{ label: "지금", value: s.equity }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="평가금액 추이" className="lg:col-span-2">
          {equity.error && <Alert className="mb-2">{equity.error}</Alert>}
          <EquityChart points={points} />
        </Section>
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
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
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
        <Section
          title="최근 활동"
          aside={
            <button type="button" className="text-xs text-accent-soft-fg hover:underline" onClick={() => onOpen("activity")}>
              전체 보기
            </button>
          }
        >
          <ActivityList items={(activity ?? []).slice(0, 8)} />
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
            <td className={td}>{p.symbol}</td>
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
                  <p className="truncate text-sm font-medium text-fg">{r.id}</p>
                  <p className="text-[11px] text-fg-subtle">
                    {r.shadow ? "그림자 (신호만 기록)" : "주문 전략"} · 마지막 판단 {now == null ? "—" : ago(r.lastDecisionAt, now)}
                  </p>
                </div>
              </div>
              {/* 좁은 화면에서는 한 줄을 다 쓰고, 넘치는 옛 판단은 왼쪽에서 잘린다 (최근 것이 오른쪽) */}
              <div className="order-last flex min-w-0 basis-full items-end justify-end gap-0.5 overflow-hidden sm:order-none sm:basis-0 sm:flex-1" aria-label={`${r.id} 최근 판단`}>
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
                label={`${r.id} ${enabled ? "끄기" : "켜기"}`}
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
              <td className={td}>{o.symbol}</td>
              <td className={cn(td, o.side === "BUY" ? TONE_TEXT.up : TONE_TEXT.down)}>{SIDE_TEXT[o.side] ?? o.side}</td>
              <td className={num}>{formatDec(o.qty)}</td>
              <td className={num}>{formatDec(o.filledQty)}</td>
              <td className={td}>{o.status}</td>
              <td className={cn(td, "text-fg-muted")}>{o.strategyId ?? "—"}</td>
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
                <td className={td}>{o.symbol}</td>
                <td className={cn(td, o.side === "BUY" ? TONE_TEXT.up : TONE_TEXT.down)}>{SIDE_TEXT[o.side] ?? o.side}</td>
                <td className={num}>{formatDec(o.qty)}</td>
                <td className={num}>
                  {formatDec(o.filledQty)}
                  {o.avgFillPrice && <span className="text-fg-subtle"> @{formatDec(o.avgFillPrice)}</span>}
                </td>
                <td className={td}>
                  <Badge tone={o.status === "FILLED" ? "success" : o.status === "REJECTED" ? "warning" : "neutral"}>{o.status}</Badge>
                </td>
                <td className={cn(td, "text-fg-muted")}>{o.strategyId ?? "—"}</td>
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
                <td className={td}>{f.symbol}</td>
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

function componentText(c: ComponentRecord | undefined, label: string): string {
  if (!c) return `${label} —`;
  const pts = c.points != null ? `${formatDec(c.points)}/${formatDec(c.max ?? null)}` : "—";
  const src = c.status ? c.status : c.source ?? "";
  return `${label} ${pts} ${src}${c.veto ? " 거부권" : ""}`.trim();
}

function DecisionRow({ d }: { d: TraderDecision }) {
  return (
    <tr className="border-b border-line/60 align-top">
      <td className={td}>{formatKst(d.barTs)}</td>
      <td className={td}>
        {d.strategyId}
        {d.shadow && (
          <Badge tone="accent" className="ml-1">
            그림자
          </Badge>
        )}
      </td>
      <td className={td}>{d.symbol}</td>
      <td className={td}>
        <Badge tone={ACTION_TONE[d.action] ?? "neutral"}>{d.action}</Badge>
      </td>
      <td className={num}>{d.score != null ? formatDec(d.score) : "—"}</td>
      <td className={cn(td, "text-fg-muted")}>
        {d.components
          ? [componentText(d.components.price, "가격"), componentText(d.components.context, "맥락"), componentText(d.components.issue, "이슈")].join(" · ")
          : "—"}
      </td>
      <td className={td}>
        {d.riskResult ? <Badge tone={RISK_TONE[d.riskResult] ?? "neutral"}>{d.riskResult}</Badge> : "—"}
        {d.riskReason && (
          <div className="mt-0.5 max-w-64 truncate text-fg-subtle" title={d.riskReason}>
            {d.riskReason}
          </div>
        )}
      </td>
      <td className={num}>
        {d.entryPrice ? (
          <>
            {formatDec(d.entryPrice)}
            <div className="text-fg-subtle">
              손절 {formatDec(d.stopLoss)} / 목표 {formatDec(d.takeProfit)} · R {formatDec(d.riskReward, 2)}
            </div>
          </>
        ) : (
          "—"
        )}
      </td>
      <td className={cn(td, "max-w-80 truncate text-fg-muted")} title={d.reason}>
        {d.reason}
      </td>
    </tr>
  );
}

export function DecisionsPanel() {
  const [signalsOnly, setSignalsOnly] = useState(true);
  const decisions = usePolling(`decisions:${signalsOnly}`, () => getTraderDecisions({ signalsOnly, limit: 60 }), 10_000, "판단 기록을 불러오지 못했습니다.");
  const perf = usePolling("perf", getTraderPerformance, 60_000, "신호 성과를 불러오지 못했습니다.");
  return (
    <div className="space-y-4">
      <Section
        title="판단 기록"
        aside={
          <label className="flex items-center gap-1.5 text-xs text-fg-muted">
            <input type="checkbox" checked={signalsOnly} onChange={(e) => setSignalsOnly(e.target.checked)} />
            매수·매도 신호만
          </label>
        }
      >
        {decisions.error && <Alert className="mb-2">{decisions.error}</Alert>}
        <DataTable head={["봉", "전략", "종목", "신호", "점수", "점수 구성", "위험 관리", "진입·손절·목표", "사유"]} empty={decisions.data?.length === 0}>
          {decisions.data?.map((d) => <DecisionRow key={d.id} d={d} />)}
        </DataTable>
      </Section>
      <Section title="신호 성과" aside={<span className="text-xs text-fg-subtle">방향 반영 수익률 (매도·청산은 내린 만큼 +)</span>}>
        {perf.error && <Alert className="mb-2">{perf.error}</Alert>}
        <DataTable head={["전략", "신호", "기간", "평가 수", "평균 수익률", "승률", "최대 유리", "최대 불리", "대기"]} empty={perf.data?.length === 0}>
          {perf.data?.map((r) => (
            <tr key={`${r.strategyId}-${r.action}-${r.horizon}`} className="border-b border-line/60">
              <td className={td}>{r.strategyId}</td>
              <td className={td}>{r.action}</td>
              <td className={td}>{r.horizon}</td>
              <td className={num}>{r.count}</td>
              <td className={num}>
                <Signed value={r.avgReturnPct} digits={2} pct />
              </td>
              <td className={num}>{formatRatioPct(r.winRate, 0, false)}</td>
              <td className={num}>{formatRatioPct(r.avgMfePct, 2)}</td>
              <td className={num}>{formatRatioPct(r.avgMaePct, 2)}</td>
              <td className={num}>{r.pending}</td>
            </tr>
          ))}
        </DataTable>
      </Section>
    </div>
  );
}

// ── 활동 로그 (Grafana 로그 패널) ────────────────────────────────────────────

const LEVEL_TEXT: Record<TraderActivity["level"], string> = { error: "오류", warn: "경고", info: "정보" };
const LEVEL_TONE: Record<TraderActivity["level"], BadgeTone> = { error: "danger", warn: "warning", info: "neutral" };
const LEVEL_BAR: Record<TraderActivity["level"], string> = { error: "bg-danger", warn: "bg-warning", info: "bg-line-strong" };

export function ActivityList({ items }: { items: TraderActivity[] }) {
  if (items.length === 0) return <p className="py-4 text-center text-xs text-fg-subtle">기록이 없습니다.</p>;
  return (
    <ol className="space-y-1.5" aria-label="활동 로그">
      {items.map((a) => (
        <li key={a.id} className="flex min-w-0 gap-2 text-xs">
          <span className={cn("w-1 shrink-0 rounded-full", LEVEL_BAR[a.level])} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 text-fg-subtle">
              <time className="tabular-nums">{formatKst(a.ts)}</time>
              <Badge tone={LEVEL_TONE[a.level]}>{LEVEL_TEXT[a.level]}</Badge>
              {a.symbol && <span>{a.symbol}</span>}
            </div>
            <p className="break-words text-fg">{a.message}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ActivityPanel() {
  const [level, setLevel] = useState<"all" | TraderActivity["level"]>("all");
  const activity = usePolling("activity:200", () => getTraderActivity(200), 10_000, "활동 로그를 불러오지 못했습니다.");
  const items = (activity.data ?? []).filter((a) => level === "all" || a.level === level);
  const count = (l: TraderActivity["level"]) => (activity.data ?? []).filter((a) => a.level === l).length;
  return (
    <Section
      title="활동 로그"
      aside={
        <div role="group" aria-label="수준" className="flex gap-1 text-xs">
          {(["all", "error", "warn", "info"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={level === l}
              onClick={() => setLevel(l)}
              className={cn(
                "rounded-full border px-2.5 py-0.5",
                level === l ? "border-accent bg-accent-soft text-accent-soft-fg" : "border-line text-fg-muted hover:bg-surface-hover"
              )}
            >
              {l === "all" ? "전체" : `${LEVEL_TEXT[l]} ${count(l)}`}
            </button>
          ))}
        </div>
      }
    >
      {activity.error && <Alert className="mb-2">{activity.error}</Alert>}
      <ActivityList items={items} />
    </Section>
  );
}
