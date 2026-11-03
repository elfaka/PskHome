"use client";

import type { Holding, Portfolio, Trade } from "@/api/stockSim";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import {
  changeTone,
  formatRate,
  formatShortTime,
  formatSignedWon,
  formatWon,
  TONE_TEXT,
} from "@/lib/stocksim/format";

/** 총자산·손익 — 상단 바의 한 줄 요약 */
export function PortfolioSummary({ portfolio }: { portfolio: Portfolio }) {
  const tone = TONE_TEXT[changeTone(portfolio.totalPnl)];

  const stats: { label: string; value: string; sub?: string; className?: string }[] = [
    { label: "총자산", value: formatWon(portfolio.totalAssets) },
    {
      label: "총손익",
      value: formatSignedWon(portfolio.totalPnl),
      sub: formatRate(portfolio.totalReturnRate),
      className: tone,
    },
  ];

  return (
    <dl aria-label="계좌 요약 (간략)" className="flex shrink-0 items-baseline gap-x-4 whitespace-nowrap">
      {stats.map((s) => (
        <div key={s.label} className="flex items-baseline gap-1.5">
          <dt className="text-xs text-fg-subtle">{s.label}</dt>
          {/* cn 은 클래스 충돌을 병합하지 않으므로 등락 색이 있으면 text-fg 를 아예 빼야 한다. */}
          <dd className={cn("text-sm font-semibold tabular-nums", s.className ?? "text-fg")}>
            {s.value}
            {s.sub && <span className="ml-1 text-xs font-medium">({s.sub})</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const TH = "px-3 py-2 text-right font-normal first:text-left";
const TD = "px-3 py-2 text-right tabular-nums first:text-left";

/** 보유 종목. 종목명을 누르면 그 종목을 선택한다. */
export function HoldingsTable({
  holdings,
  selectedSymbol,
  onSelect,
}: {
  holdings: Holding[];
  selectedSymbol?: string;
  onSelect: (h: Holding) => void;
}) {
  if (holdings.length === 0) {
    return <EmptyState className="m-3 py-8" title="보유 종목이 없습니다" description="종목을 골라 첫 매수를 해 보세요." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="text-xs text-fg-subtle">
          <tr className="border-b border-line">
            <th className={TH}>종목</th>
            <th className={TH}>수량</th>
            <th className={TH}>평균단가</th>
            <th className={TH}>현재가</th>
            <th className={TH}>매입금액</th>
            <th className={TH}>평가금액</th>
            <th className={TH}>평가손익</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const tone = TONE_TEXT[changeTone(h.unrealizedPnl)];
            return (
              <tr
                key={h.symbol}
                className={cn("border-b border-line last:border-0", h.symbol === selectedSymbol && "bg-surface-2")}
              >
                <td className={TD}>
                  <button type="button" onClick={() => onSelect(h)} className="text-left text-fg hover:underline">
                    {h.name}
                    <span className="ml-1.5 font-mono text-xs text-fg-subtle">{h.symbol}</span>
                  </button>
                </td>
                <td className={TD}>{h.quantity.toLocaleString("ko-KR")}</td>
                <td className={TD}>{formatWon(h.avgPrice)}</td>
                <td className={cn(TD, tone)}>{h.currentPrice == null ? "-" : formatWon(h.currentPrice)}</td>
                <td className={TD}>{formatWon(h.costBasis)}</td>
                <td className={TD}>{formatWon(h.marketValue)}</td>
                <td className={cn(TD, tone)}>
                  {h.unrealizedPnl == null ? (
                    <span className="text-fg-subtle">시세 없음</span>
                  ) : (
                    <>
                      {formatSignedWon(h.unrealizedPnl)}
                      <span className="ml-1 text-xs">({formatRate(h.returnRate ?? 0)})</span>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 거래내역 (최신순) */
export function TradeHistory({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return <EmptyState className="m-3 py-8" title="거래내역이 없습니다" />;

  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="sticky top-0 bg-surface text-xs text-fg-subtle">
          <tr className="border-b border-line">
            <th className={TH}>시각</th>
            <th className={cn(TH, "text-left")}>종목</th>
            <th className={TH}>구분</th>
            <th className={TH}>수량</th>
            <th className={TH}>체결가</th>
            <th className={TH}>금액</th>
            <th className={TH}>실현손익</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-b border-line last:border-0">
              <td className={cn(TD, "font-mono text-xs text-fg-subtle")}>{formatShortTime(t.executedAt)}</td>
              <td className={cn(TD, "text-left text-fg")}>{t.name}</td>
              <td className={TD}>
                <Badge tone={t.side === "BUY" ? "danger" : "info"}>{t.side === "BUY" ? "매수" : "매도"}</Badge>
              </td>
              <td className={TD}>{t.quantity.toLocaleString("ko-KR")}</td>
              <td className={TD}>{formatWon(t.price)}</td>
              <td className={TD}>{formatWon(t.amount)}</td>
              <td className={cn(TD, TONE_TEXT[changeTone(t.realizedPnl)])}>
                {t.realizedPnl == null ? "-" : formatSignedWon(t.realizedPnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 계좌 탭 — 요약 카드, 보유 종목, 거래내역 */
export function AccountPanel({
  portfolio,
  selectedSymbol,
  onSelect,
  onReset,
}: {
  portfolio: Portfolio;
  selectedSymbol: string;
  onSelect: (h: Holding) => void;
  onReset: () => void;
}) {
  const tone = TONE_TEXT[changeTone(portfolio.totalPnl)];
  const cards: { label: string; value: string; sub?: string; className?: string }[] = [
    { label: "총자산", value: formatWon(portfolio.totalAssets), sub: `시작 ${formatWon(portfolio.initialCash)}` },
    { label: "총손익", value: formatSignedWon(portfolio.totalPnl), sub: formatRate(portfolio.totalReturnRate), className: tone },
    { label: "예수금", value: formatWon(portfolio.cash) },
    { label: "평가금액", value: formatWon(portfolio.totalMarketValue) },
    {
      label: "실현손익",
      value: formatSignedWon(portfolio.realizedPnl),
      className: TONE_TEXT[changeTone(portfolio.realizedPnl)],
    },
  ];

  return (
    <div className="space-y-3">
      <section aria-label="계좌 요약" className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <h2 className="text-sm font-semibold text-fg">계좌 요약</h2>
          <Button size="sm" variant="ghost" onClick={onReset}>
            계좌 초기화
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-5">
          {cards.map((c) => (
            <div key={c.label} className="bg-surface px-3 py-2.5">
              <dt className="text-xs text-fg-subtle">{c.label}</dt>
              <dd className={cn("text-base font-semibold tabular-nums", c.className ?? "text-fg")}>
                {c.value}
                {c.sub && <span className="ml-1.5 text-xs font-medium">{c.sub}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label={`보유종목 ${portfolio.holdings.length}`} className="overflow-hidden rounded-card border border-line bg-surface">
        <h2 className="border-b border-line px-3 py-2 text-sm font-semibold text-fg">보유종목 {portfolio.holdings.length}</h2>
        <HoldingsTable holdings={portfolio.holdings} selectedSymbol={selectedSymbol} onSelect={onSelect} />
      </section>

      <section aria-label={`거래내역 ${portfolio.trades.length}`} className="overflow-hidden rounded-card border border-line bg-surface">
        <h2 className="border-b border-line px-3 py-2 text-sm font-semibold text-fg">거래내역 {portfolio.trades.length}</h2>
        <TradeHistory trades={portfolio.trades} />
      </section>
    </div>
  );
}
