"use client";

import { useState } from "react";

import {
  getTraderDecisions,
  getTraderFills,
  getTraderOrders,
  getTraderPerformance,
  getTraderRiskEvents,
  getTraderSummary,
  type ComponentRecord,
  type TraderDecision,
} from "@/api/trader";
import Alert from "@/components/ui/Alert";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { cardClass } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { TONE_TEXT } from "@/lib/stocksim/format";
import { usePolling } from "@/lib/stocksim/usePolling";
import { formatDec, formatKst, formatRatioPct, signOf } from "@/lib/trader/decimal";

/**
 * 자동매매 대시보드 — 엔진 DB 를 읽기만 한다 (주문·킬스위치 조작 없음).
 * 숫자는 백엔드가 준 Decimal 문자열을 그대로 포맷한다. 상승 빨강 / 하락 파랑 (국내 관례).
 */

const REFRESH_MS = 10_000;

const ACTION_TONE: Record<string, BadgeTone> = {
  BUY: "danger",
  SELL: "info",
  EXIT: "info",
  HOLD: "neutral",
  WAIT: "neutral",
};

const RISK_TONE: Record<string, BadgeTone> = {
  APPROVED: "success",
  REJECTED: "warning",
  DUPLICATE: "neutral",
  SHADOW: "accent",
};

function Signed({ value, digits = 0, pct = false }: { value: string | null; digits?: number; pct?: boolean }) {
  return (
    <span className={cn("tabular-nums", TONE_TEXT[signOf(value)])}>
      {pct ? formatRatioPct(value, digits) : formatDec(value, digits, true)}
    </span>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    // min-w-0: 그리드 안에서 넓은 표가 카드를 밀어 화면 밖으로 넘치지 않게 (표는 카드 안에서 가로 스크롤)
    <section className={cardClass({ className: "min-w-0 p-4 sm:p-5" })} aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-max text-left text-xs">
        <thead>
          <tr className="border-b border-line text-fg-subtle">
            {head.map((h) => (
              <th key={h} className="px-1 py-1.5 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-fg">{children}</tbody>
      </table>
      {empty && <p className="py-4 text-center text-xs text-fg-subtle">기록이 없습니다.</p>}
    </div>
  );
}

const td = "px-1 py-1.5 whitespace-nowrap";
const num = cn(td, "text-right tabular-nums");

function Stat({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className={cardClass({ className: "p-4" })}>
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-fg tabular-nums">{children}</div>
      {hint && <div className="mt-0.5 text-xs text-fg-subtle">{hint}</div>}
    </div>
  );
}

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
          ? [
              componentText(d.components.price, "가격"),
              componentText(d.components.context, "맥락"),
              componentText(d.components.issue, "이슈"),
            ].join(" · ")
          : "—"}
      </td>
      <td className={td}>
        {d.riskResult ? <Badge tone={RISK_TONE[d.riskResult] ?? "neutral"}>{d.riskResult}</Badge> : "—"}
        {d.riskReason && <div className="mt-0.5 max-w-64 truncate text-fg-subtle" title={d.riskReason}>{d.riskReason}</div>}
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

export default function TraderDashboard({ username, onLogout }: { username: string; onLogout: () => Promise<void> }) {
  const [signalsOnly, setSignalsOnly] = useState(true);
  const summary = usePolling("summary", getTraderSummary, REFRESH_MS, "요약을 불러오지 못했습니다.");
  const decisions = usePolling(
    `decisions:${signalsOnly}`,
    () => getTraderDecisions({ signalsOnly }),
    REFRESH_MS,
    "판단 기록을 불러오지 못했습니다."
  );
  const perf = usePolling("perf", getTraderPerformance, 60_000, "신호 성과를 불러오지 못했습니다.");
  const orders = usePolling("orders", () => getTraderOrders(30), REFRESH_MS, "주문을 불러오지 못했습니다.");
  const fills = usePolling("fills", () => getTraderFills(30), REFRESH_MS, "체결을 불러오지 못했습니다.");
  const risk = usePolling("risk", () => getTraderRiskEvents(20), REFRESH_MS, "위험 이벤트를 불러오지 못했습니다.");

  const s = summary.data;

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">자동매매</h1>
          <p className="text-xs text-fg-muted">
            가상매매 · 계좌 {s?.account?.name ?? "—"} · 마지막 시세 {formatKst(s?.lastQuoteAt)} · 마지막 판단{" "}
            {formatKst(s?.lastDecisionAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {s && (
            <Badge tone={s.killswitch.halted ? "danger" : "success"}>
              {s.killswitch.halted ? `중지됨${s.killswitch.reason ? ` · ${s.killswitch.reason}` : ""}` : "가동 중"}
            </Badge>
          )}
          <span className="text-xs text-fg-subtle">{username}</span>
          <Button variant="secondary" size="sm" onClick={() => void onLogout()}>
            로그아웃
          </Button>
        </div>
      </header>

      {summary.error && <Alert>{summary.error}</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="평가금액" hint={s?.equity == null && s?.positions.length ? "보유 종목 시세 없음" : undefined}>
          {formatDec(s?.equity ?? null)}
        </Stat>
        <Stat label="현금">{formatDec(s?.cash ?? null)}</Stat>
        <Stat label="오늘 손익" hint={s?.dayStartEquity ? `기준 ${formatDec(s.dayStartEquity)}` : "오늘 기준 없음"}>
          <Signed value={s?.dayPnl ?? null} />
        </Stat>
        <Stat label="미체결 주문">{s ? s.openOrders : "—"}</Stat>
      </div>

      <Section title="보유 종목">
        <Table
          head={["종목", "수량", "평균가", "현재가", "평가금액", "평가손익", "실현손익"]}
          empty={!!s && s.positions.length === 0}
        >
          {s?.positions.map((p) => (
            <tr key={p.symbol} className="border-b border-line/60">
              <td className={td}>{p.symbol}</td>
              <td className={num}>{formatDec(p.qty)}</td>
              <td className={num}>{formatDec(p.avgPrice)}</td>
              <td className={num} title={formatKst(p.lastPriceAt)}>
                {formatDec(p.lastPrice)}
              </td>
              <td className={num}>{formatDec(p.marketValue)}</td>
              <td className={num}>
                <Signed value={p.unrealizedPnl} />
              </td>
              <td className={num}>
                <Signed value={p.realizedPnl} />
              </td>
            </tr>
          ))}
        </Table>
      </Section>

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
        <Table
          head={["봉", "전략", "종목", "신호", "점수", "점수 구성", "위험 관리", "진입·손절·목표", "사유"]}
          empty={decisions.data?.length === 0}
        >
          {decisions.data?.map((d) => <DecisionRow key={d.id} d={d} />)}
        </Table>
      </Section>

      <Section title="신호 성과" aside={<span className="text-xs text-fg-subtle">방향 반영 수익률 (매도·청산은 내린 만큼 +)</span>}>
        {perf.error && <Alert className="mb-2">{perf.error}</Alert>}
        <Table
          head={["전략", "신호", "기간", "평가 수", "평균 수익률", "승률", "최대 유리", "최대 불리", "대기"]}
          empty={perf.data?.length === 0}
        >
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
        </Table>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="주문">
          <Table head={["시각", "종목", "구분", "수량", "체결", "상태", "전략"]} empty={orders.data?.length === 0}>
            {orders.data?.map((o) => (
              <tr key={o.clientOrderId} className="border-b border-line/60" title={o.rejectReason ?? o.clientOrderId}>
                <td className={td}>{formatKst(o.createdAt)}</td>
                <td className={td}>{o.symbol}</td>
                <td className={cn(td, o.side === "BUY" ? TONE_TEXT.up : TONE_TEXT.down)}>{o.side}</td>
                <td className={num}>{formatDec(o.qty)}</td>
                <td className={num}>
                  {formatDec(o.filledQty)}
                  {o.avgFillPrice && <span className="text-fg-subtle"> @{formatDec(o.avgFillPrice)}</span>}
                </td>
                <td className={td}>{o.status}</td>
                <td className={cn(td, "text-fg-muted")}>{o.strategyId ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </Section>

        <Section title="체결">
          <Table head={["시각", "종목", "구분", "수량", "가격", "수수료", "세금"]} empty={fills.data?.length === 0}>
            {fills.data?.map((f) => (
              <tr key={f.execId} className="border-b border-line/60">
                <td className={td}>{formatKst(f.ts)}</td>
                <td className={td}>{f.symbol}</td>
                <td className={cn(td, f.side === "BUY" ? TONE_TEXT.up : TONE_TEXT.down)}>{f.side}</td>
                <td className={num}>{formatDec(f.qty)}</td>
                <td className={num}>{formatDec(f.price)}</td>
                <td className={num}>{formatDec(f.commission)}</td>
                <td className={num}>{formatDec(f.tax)}</td>
              </tr>
            ))}
          </Table>
        </Section>
      </div>

      <Section title="위험 이벤트">
        <Table head={["시각", "종류", "종목", "내용"]} empty={risk.data?.length === 0}>
          {risk.data?.map((e) => (
            <tr key={e.id} className="border-b border-line/60">
              <td className={td}>{formatKst(e.ts)}</td>
              <td className={td}>{e.kind}</td>
              <td className={td}>{e.symbol ?? "—"}</td>
              <td className={cn(td, "max-w-[32rem] truncate text-fg-muted")}>
                {e.detail == null ? "—" : JSON.stringify(e.detail)}
              </td>
            </tr>
          ))}
        </Table>
      </Section>

      <p className="text-center text-xs text-fg-subtle">
        읽기 전용 화면입니다. 즉시 중지는 서버에서 <code>trader halt --reason &quot;...&quot;</code> 로 합니다.
      </p>
    </main>
  );
}
