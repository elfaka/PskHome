import type { Holding, Portfolio, Trade } from "@/api/stockSim";
import Badge from "@/components/ui/Badge";
import { cardClass } from "@/components/ui/Card";
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

/** 총자산·손익·예수금·평가금액 요약 */
export function PortfolioSummary({ portfolio }: { portfolio: Portfolio }) {
  const tone = TONE_TEXT[changeTone(portfolio.totalPnl)];

  const stats: { label: string; value: string; sub?: string; className?: string }[] = [
    { label: "총자산", value: formatWon(portfolio.totalAssets), sub: `시작 ${formatWon(portfolio.initialCash)}` },
    {
      label: "총손익",
      value: formatSignedWon(portfolio.totalPnl),
      sub: formatRate(portfolio.totalReturnRate),
      className: tone,
    },
    { label: "예수금", value: formatWon(portfolio.cash) },
    {
      label: "평가금액",
      value: formatWon(portfolio.totalMarketValue),
      sub: `실현손익 ${formatSignedWon(portfolio.realizedPnl)}`,
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className={cardClass({ className: "p-4" })}>
          <dt className="text-xs text-fg-muted">{s.label}</dt>
          {/* cn 은 클래스 충돌을 병합하지 않으므로 등락 색이 있으면 text-fg 를 아예 빼야 한다. */}
          <dd className={cn("mt-1 text-lg font-semibold tabular-nums", s.className ?? "text-fg")}>{s.value}</dd>
          {s.sub && <dd className={cn("mt-0.5 text-xs tabular-nums", s.className ?? "text-fg-subtle")}>{s.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

const TH = "px-3 py-2 text-right font-medium first:text-left";
const TD = "px-3 py-2 text-right tabular-nums first:text-left";

/** 보유 종목. 행을 누르면 그 종목을 선택한다. */
export function HoldingsTable({
  holdings,
  selectedSymbol,
  onSelect,
}: {
  holdings: Holding[];
  selectedSymbol?: string;
  onSelect: (h: Holding) => void;
}) {
  return (
    <section className={cardClass({ className: "p-4" })} aria-labelledby="stocksim-holdings">
      <h2 id="stocksim-holdings" className="mb-3 text-sm font-semibold text-fg">
        보유 종목
      </h2>

      {holdings.length === 0 ? (
        <EmptyState className="py-8" title="보유 종목이 없습니다" description="종목을 검색해 첫 매수를 해 보세요." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-xs text-fg-muted">
              <tr className="border-b border-line">
                <th className={TH}>종목</th>
                <th className={TH}>수량</th>
                <th className={TH}>평균단가</th>
                <th className={TH}>현재가</th>
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
                    className={cn(
                      "border-b border-line last:border-0",
                      h.symbol === selectedSymbol && "bg-surface-2"
                    )}
                  >
                    <td className={TD}>
                      <button
                        type="button"
                        onClick={() => onSelect(h)}
                        className="text-left text-fg hover:underline"
                      >
                        {h.name}
                        <span className="ml-1.5 font-mono text-xs text-fg-subtle">{h.symbol}</span>
                      </button>
                    </td>
                    <td className={TD}>{h.quantity.toLocaleString("ko-KR")}</td>
                    <td className={TD}>{formatWon(h.avgPrice)}</td>
                    <td className={TD}>{h.currentPrice == null ? "-" : formatWon(h.currentPrice)}</td>
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
      )}
    </section>
  );
}

/** 거래내역 (최신순) */
export function TradeHistory({ trades }: { trades: Trade[] }) {
  return (
    <section className={cardClass({ className: "p-4" })} aria-labelledby="stocksim-trades">
      <h2 id="stocksim-trades" className="mb-3 text-sm font-semibold text-fg">
        거래내역
      </h2>

      {trades.length === 0 ? (
        <EmptyState className="py-8" title="거래내역이 없습니다" />
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-xs text-fg-muted">
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
      )}
    </section>
  );
}
