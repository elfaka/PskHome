"use client";

import { useMemo, useState } from "react";

import {
  getOverview,
  getPortfolio,
  getQuotesWithChange,
  resetPortfolio,
  type OrderSide,
  type QuoteWithChange,
} from "@/api/stockSim";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Container from "@/components/ui/Container";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errorMessage";
import { usePolling } from "@/lib/stocksim/usePolling";
import { DEFAULT_WATCHLIST, useWatchlist } from "@/lib/stocksim/watchlist";

import AnalysisPanel from "./AnalysisPanel";
import ChartPanel from "./ChartPanel";
import InvestorFlowPanel from "./InvestorFlowPanel";
import OrderbookPanel from "./OrderbookPanel";
import OrderPanel from "./OrderPanel";
import { AccountDock, PortfolioSummary } from "./PortfolioSections";
import StockHeader from "./StockHeader";
import StockSearch from "./StockSearch";
import TradesPanel from "./TradesPanel";
import ValuationPanel from "./ValuationPanel";
import WatchRail from "./WatchRail";

/** 화면에서 고른 종목 */
type SelectedStock = { symbol: string; name: string };

const PRICE_REFRESH_MS = 5_000;
const PORTFOLIO_REFRESH_MS = 10_000;

type InsightTab = "analysis" | "valuation" | "investors";
const INSIGHT_TABS: { value: InsightTab; label: string }[] = [
  { value: "analysis", label: "매매 신호" },
  { value: "valuation", label: "투자 지표" },
  { value: "investors", label: "투자자 동향" },
];

/** 좁은 화면에서는 패널을 탭으로 나눠 하나씩 보여준다. */
type MobileTab = "chart" | "order" | "insight" | "account";
const MOBILE_TABS: { value: MobileTab; label: string }[] = [
  { value: "chart", label: "차트" },
  { value: "order", label: "호가·주문" },
  { value: "insight", label: "분석" },
  { value: "account", label: "계좌" },
];

const panel = "overflow-hidden rounded-card border border-line bg-surface";

/**
 * 주식 모의투자 — 증권사 WTS 형태의 화면.
 *
 * ```
 * ┌ 관심/보유 ┬ 종목 시세 · 차트 · 분석 탭 ┬ 호가 · 주문 · 체결 ┐   (xl 이상 3열)
 * └──────────┴───────── 계좌(보유종목·거래내역) ──────────────┘
 * ```
 * lg 에서는 왼쪽 목록이 가로 칩으로 위에 붙고, 그보다 좁으면 패널을 탭으로 나눈다.
 * 포트폴리오는 백엔드 세션에 있다 (로그인 불필요, 재배포 시 초기화).
 */
export default function StockSimulator() {
  const [selected, setSelected] = useState<SelectedStock>(DEFAULT_WATCHLIST[0]);
  const [side, setSide] = useState<OrderSide>("BUY");
  const [insightTab, setInsightTab] = useState<InsightTab>("analysis");
  const [mobileTab, setMobileTab] = useState<MobileTab>("chart");
  const [resetError, setResetError] = useState<string | null>(null);
  const watchlist = useWatchlist();

  const portfolio = usePolling("portfolio", getPortfolio, PORTFOLIO_REFRESH_MS, "포트폴리오를 불러오지 못했습니다.");
  const overview = usePolling(selected.symbol, () => getOverview(selected.symbol), PRICE_REFRESH_MS, "시세를 불러오지 못했습니다.");

  const holdings = useMemo(() => portfolio.data?.holdings ?? [], [portfolio.data]);
  const railSymbols = useMemo(() => {
    const symbols = new Set(watchlist.items.map((i) => i.symbol));
    for (const h of holdings) symbols.add(h.symbol);
    return [...symbols];
  }, [watchlist.items, holdings]);

  const railQuotes = usePolling(
    railSymbols.length > 0 ? railSymbols.join(",") : null,
    () => getQuotesWithChange(railSymbols),
    PRICE_REFRESH_MS
  );
  const quoteMap = useMemo(
    () => new Map<string, QuoteWithChange>((railQuotes.data ?? []).map((q) => [q.symbol, q])),
    [railQuotes.data]
  );

  const o = overview.data;
  const held = holdings.find((h) => h.symbol === selected.symbol);

  const select = (stock: SelectedStock) => {
    setSelected({ symbol: stock.symbol, name: stock.name });
    setMobileTab("chart");
  };

  const pickSide = (next: OrderSide) => {
    setSide(next);
    setMobileTab("order");
  };

  const reset = async () => {
    if (!window.confirm("예수금 1,000만 원으로 처음부터 다시 시작할까요? 보유 종목과 거래내역이 모두 지워집니다.")) {
      return;
    }
    try {
      await resetPortfolio();
      setResetError(null);
      portfolio.refresh();
    } catch (e) {
      setResetError(errorMessage(e, "초기화하지 못했습니다."));
    }
  };

  /** 좁은 화면에서 지금 탭이 아니면 숨긴다 (lg 이상은 항상 보인다) */
  const mobileOnly = (tab: MobileTab) => mobileTab !== tab && "max-lg:hidden";

  return (
    <Container size="full" className="py-2 sm:py-3">
      {/* 상단 바 — 화면 이름 · 출처 · 계좌 요약 */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold text-fg">주식 모의투자</h1>
          <Badge>시세 토스증권</Badge>
          <Badge>재무 OpenDART</Badge>
        </div>
        {portfolio.data && <PortfolioSummary portfolio={portfolio.data} />}
      </div>

      {(portfolio.error || resetError) && (
        <Alert className="mb-2">{resetError ?? portfolio.error}</Alert>
      )}

      {/* 좁은 화면: 검색 + 관심종목 칩 */}
      <div className="mb-2 space-y-2 xl:hidden">
        <StockSearch id="stocksim-search-compact" onSelect={select} />
        <WatchRail
          layout="horizontal"
          watchlist={watchlist.items}
          holdings={holdings}
          quotes={quoteMap}
          selectedSymbol={selected.symbol}
          onSelect={select}
        />
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[15rem_minmax(0,1fr)_21rem]">
        {/* 왼쪽: 검색 + 관심/보유 (xl 이상) */}
        <aside
          className={cn(
            panel,
            "hidden xl:sticky xl:top-[4.5rem] xl:flex xl:max-h-[calc(100dvh-5.5rem)] xl:flex-col xl:self-start"
          )}
        >
          <div className="border-b border-line p-2">
            <StockSearch id="stocksim-search" onSelect={select} />
          </div>
          <WatchRail
            layout="vertical"
            watchlist={watchlist.items}
            holdings={holdings}
            quotes={quoteMap}
            selectedSymbol={selected.symbol}
            onSelect={select}
          />
        </aside>

        {/* 가운데: 종목 시세 · 차트 · 분석 */}
        <div className="flex min-w-0 flex-col gap-2">
          <div className={panel}>
            <StockHeader
              name={selected.name}
              symbol={selected.symbol}
              overview={o}
              error={overview.error}
              watched={watchlist.has(selected.symbol)}
              onToggleWatch={() => watchlist.toggle({ symbol: selected.symbol, name: o?.name ?? selected.name })}
            />
          </div>

          {/* 모바일 탭 */}
          <div
            role="tablist"
            aria-label="화면 구역"
            className="sticky top-16 z-20 grid grid-cols-4 rounded-card border border-line bg-surface p-1 shadow-card lg:hidden"
          >
            {MOBILE_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={mobileTab === t.value}
                onClick={() => setMobileTab(t.value)}
                className={cn(
                  "h-8 rounded-control text-sm font-medium transition",
                  mobileTab === t.value ? "bg-fg text-bg" : "text-fg-muted"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className={cn(panel, mobileOnly("chart"))}>
            <ChartPanel symbol={selected.symbol} livePrice={o?.price ?? null} liveTime={o?.priceTime ?? null} />
          </div>

          <div className={cn(panel, mobileOnly("insight"))}>
            <div role="tablist" aria-label="분석" className="flex border-b border-line px-1">
              {INSIGHT_TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={insightTab === t.value}
                  onClick={() => setInsightTab(t.value)}
                  className={cn(
                    "border-b-2 px-3 py-2.5 text-sm font-medium transition",
                    insightTab === t.value ? "border-fg text-fg" : "border-transparent text-fg-muted hover:text-fg"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {insightTab === "analysis" && <AnalysisPanel symbol={selected.symbol} />}
            {insightTab === "valuation" && <ValuationPanel overview={o} />}
            {insightTab === "investors" && <InvestorFlowPanel symbol={selected.symbol} />}
          </div>
        </div>

        {/* 오른쪽: 호가 · 주문 · 체결 */}
        <div className={cn("flex min-w-0 flex-col gap-2", mobileOnly("order"))}>
          <div className={panel}>
            <OrderbookPanel
              symbol={selected.symbol}
              prevClose={o?.prevClose ?? null}
              currentPrice={o?.price ?? null}
              onPickSide={pickSide}
            />
          </div>
          <div className={panel}>
            <OrderPanel
              stock={selected}
              price={o?.price ?? null}
              cash={portfolio.data?.cash ?? 0}
              heldQuantity={held?.quantity ?? 0}
              side={side}
              onSideChange={setSide}
              onFilled={() => portfolio.refresh()}
            />
          </div>
          <div className={panel}>
            <TradesPanel symbol={selected.symbol} prevClose={o?.prevClose ?? null} />
          </div>
        </div>

        {/* 아래: 계좌 */}
        {portfolio.data && (
          <div className={cn(panel, "lg:col-span-2 xl:col-span-3", mobileOnly("account"))}>
            <AccountDock
              portfolio={portfolio.data}
              selectedSymbol={selected.symbol}
              onSelect={(h) => select(h)}
              onReset={reset}
            />
          </div>
        )}
      </div>
    </Container>
  );
}
