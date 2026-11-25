"use client";

import { useMemo, useState, type ReactNode } from "react";

import {
  getMarket,
  getOverview,
  // 모의투자 — getPortfolio, resetPortfolio, type OrderSide,
  getQuotesWithChange,
  type Holding,
  type MarketChartSymbol,
  type QuoteWithChange,
} from "@/api/stockSim";
// 모의투자 — import Alert from "@/components/ui/Alert";
import Container from "@/components/ui/Container";
// 모의투자 — import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
// 모의투자 — import { errorMessage } from "@/lib/errorMessage";
import { usePolling } from "@/lib/stocksim/usePolling";
import { useSimTab, type SimTab } from "@/lib/stocksim/useTab";
import { DEFAULT_WATCHLIST, useWatchlist } from "@/lib/stocksim/watchlist";

import AnalysisPanel from "./AnalysisPanel";
import ChartPanel from "./ChartPanel";
import FinancialsPanel from "./FinancialsPanel";
import { GlossaryList } from "./Glossary";
import InvestorFlowPanel from "./InvestorFlowPanel";
import InvestorRankingPanel from "./InvestorRankingPanel";
import TodayFlowCard from "./TodayFlowCard";
import MarketPanel from "./MarketPanel";
import MarketStrip from "./MarketStrip";
import OrderbookPanel from "./OrderbookPanel";
// 모의투자 — import OrderPanel from "./OrderPanel";
// 모의투자 — import { AccountPanel, PortfolioSummary } from "./PortfolioSections";
import StockHeader, { StockStats } from "./StockHeader";
import StockSearch from "./StockSearch";
import TradesPanel from "./TradesPanel";
import ValuationPanel from "./ValuationPanel";
import WatchRail from "./WatchRail";

/*
 * ─── 모의투자(가상 매매) 보존 안내 ───────────────────────────────────────────
 * 이 화면은 종목 정보를 한눈에 판단하는 페이지로 바뀌어 주문·계좌 기능을 화면에서 뺐다.
 * 코드는 지우지 않고 "모의투자 —" 주석으로 남겼다. 다시 넣을 때는 이 파일에서 "모의투자" 를 찾아
 * 주석을 풀고, `lib/stocksim/useTab.ts` 의 "account" 탭과 테스트의 주석 블록도 되살린다.
 * `OrderPanel.tsx`, `PortfolioSections.tsx`, `api/stockSim.ts` 의 주문·포트폴리오 함수,
 * 백엔드 매매 엔드포인트는 그대로 있다.
 * ──────────────────────────────────────────────────────────────────────────────
 */

/** 화면에서 고른 종목 */
type SelectedStock = { symbol: string; name: string };

const PRICE_REFRESH_MS = 5_000;
// 모의투자 — const PORTFOLIO_REFRESH_MS = 10_000;
const MARKET_REFRESH_MS = 10_000;
/** 모의투자를 빼서 보유 종목이 없다 (관심 줄이 보유 칩을 그리지 않는다) */
const NO_HOLDINGS: Holding[] = [];

const TABS: { value: SimTab; label: string }[] = [
  { value: "trade", label: "매매" },
  { value: "valuation", label: "투자 지표" },
  { value: "investors", label: "투자자 동향" },
  { value: "market", label: "시장" },
  // 모의투자 — { value: "account", label: "계좌" },
];

/** 종목을 고르는 탭 — 이 탭들에서만 종목 선택 줄을 보여준다 */
const STOCK_TABS: SimTab[] = ["trade", "valuation", "investors"];

/** 좁은 화면의 매매 탭은 차트·신호 / 호가·체결을 나눠 보여준다. */
type TradePane = "chart" | "order";

function Panel({ title, aside, children, className }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("overflow-hidden rounded-card border border-line bg-surface", className)}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * 주식 정보 — 상단 바의 탭으로 화면을 나눈다. (예전 모의투자 화면, 주문·계좌는 주석으로 보존)
 *
 * ```
 * ┌ 주식 모의투자 [매매|투자 지표|투자자 동향|시장]   코스피 · 코스닥 · VIX · 공포탐욕 ┐  (상단 바, 고정)
 * ├ ★ 종목 시세 · 검색 · 관심 칩 ─────────────────────────────────────────────┤  (종목 탭에서만)
 * └ 탭 화면 — 매매: 시세 요약·차트·매매 신호 │ 호가·체결 ─────────────────────┘
 * ```
 * 탭은 주소 `?tab=` 에 남는다.
 */
export default function StockSimulator() {
  const [tab, changeTab] = useSimTab();
  const [selected, setSelected] = useState<SelectedStock>(DEFAULT_WATCHLIST[0]);
  // 모의투자 — const [side, setSide] = useState<OrderSide>("BUY");
  const [tradePane, setTradePane] = useState<TradePane>("chart");
  const [marketIndex, setMarketIndex] = useState<MarketChartSymbol>("KOSPI");
  // 모의투자 — const [resetError, setResetError] = useState<string | null>(null);
  const watchlist = useWatchlist();

  // 모의투자 — const portfolio = usePolling("portfolio", getPortfolio, PORTFOLIO_REFRESH_MS, "포트폴리오를 불러오지 못했습니다.");
  const market = usePolling("market", getMarket, MARKET_REFRESH_MS, "지수를 불러오지 못했습니다.");
  const overview = usePolling(selected.symbol, () => getOverview(selected.symbol), PRICE_REFRESH_MS, "시세를 불러오지 못했습니다.");

  // 모의투자 — const holdings = useMemo(() => portfolio.data?.holdings ?? [], [portfolio.data]);
  const holdings = NO_HOLDINGS;
  const railSymbols = useMemo(() => {
    const symbols = new Set(watchlist.items.map((i) => i.symbol));
    for (const h of holdings) symbols.add(h.symbol);
    return [...symbols];
  }, [watchlist.items, holdings]);

  // 종목 선택 줄이 보일 때만 관심종목 시세를 받는다.
  const stockTab = STOCK_TABS.includes(tab);
  const railQuotes = usePolling(
    stockTab && railSymbols.length > 0 ? railSymbols.join(",") : null,
    () => getQuotesWithChange(railSymbols),
    PRICE_REFRESH_MS
  );
  const quoteMap = useMemo(
    () => new Map<string, QuoteWithChange>((railQuotes.data ?? []).map((q) => [q.symbol, q])),
    [railQuotes.data]
  );

  const o = overview.data;
  // 모의투자 — const held = holdings.find((h) => h.symbol === selected.symbol);
  /** 투자자 수급은 국내 종목만 있다 (개요를 받기 전에는 그리지 않는다) */
  const domestic = o?.symbol === selected.symbol && o.currency === "KRW";

  /** 탭을 바꾸면 새 화면을 처음부터 보이게 맨 위로 올린다 (상단 바는 고정이라 그대로 보인다). */
  const setTab = (next: SimTab) => {
    changeTab(next);
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  };

  const select = (stock: SelectedStock) => {
    setSelected({ symbol: stock.symbol, name: stock.name });
    setTradePane("chart");
  };

  /** 지수 요약을 누르면 시장 탭으로 */
  const openMarket = (target: MarketChartSymbol | "fearGreed") => {
    if (target !== "fearGreed") setMarketIndex(target);
    setTab("market");
  };

  /* 모의투자 — 호가를 누르면 주문창을 그 방향으로 연다
  const pickSide = (next: OrderSide) => {
    setSide(next);
    setTradePane("order");
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
  */

  /** 좁은 화면 매매 탭에서 지금 하위 탭이 아니면 숨긴다 (lg 이상은 항상 보인다) */
  const paneOnly = (pane: TradePane) => tradePane !== pane && "max-lg:hidden";

  return (
    <Container size="full" className="pb-3">
      {/* 상단 바 — 탭 · 지수 요약.
          사이트 헤더(SiteHeader: h-14 + 아래 테두리 1px) 바로 밑에 붙는다. 헤더 높이를 바꾸면 여기도 바꾼다. */}
      <div className="sticky top-[calc(3.5rem+1px)] z-30 -mx-2 border-b border-line bg-bg/90 px-2 backdrop-blur-md sm:-mx-3 sm:px-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
          <h1 className="text-base font-bold whitespace-nowrap text-fg max-sm:hidden">주식 모의투자</h1>
          <div role="tablist" aria-label="화면" className="flex min-w-0 gap-0.5 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  "h-8 shrink-0 rounded-control px-3 text-sm font-medium whitespace-nowrap transition",
                  tab === t.value ? "bg-fg text-bg" : "text-fg-muted hover:bg-surface-hover hover:text-fg"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 items-center gap-3 max-xl:w-full xl:ml-auto">
            <MarketStrip
              indices={market.data?.indices ?? null}
              vix={market.data?.vix ?? null}
              fearGreed={market.data?.fearGreed ?? null}
              error={market.error}
              onOpen={openMarket}
            />
            {/* 모의투자 — 상단 바 계좌 요약
            {portfolio.data && (
              <div className="ml-auto border-l border-line pl-3 max-md:hidden">
                <PortfolioSummary portfolio={portfolio.data} />
              </div>
            )}
            */}
          </div>
        </div>
      </div>

      {/* 모의투자 — {(portfolio.error || resetError) && <Alert className="mt-2">{resetError ?? portfolio.error}</Alert>} */}

      {/* 종목 선택 줄 — 종목 시세 · 검색 · 관심 칩 */}
      {stockTab && (
        <div className="mt-2 space-y-2 rounded-card border border-line bg-surface px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <StockHeader
              name={selected.name}
              symbol={selected.symbol}
              overview={o}
              error={overview.error}
              watched={watchlist.has(selected.symbol)}
              onToggleWatch={() => watchlist.toggle({ symbol: selected.symbol, name: o?.name ?? selected.name })}
            />
            <div className="w-full sm:ml-auto sm:w-80">
              <StockSearch id="stocksim-search" onSelect={select} />
            </div>
          </div>
          <WatchRail
            layout="horizontal"
            watchlist={watchlist.items}
            holdings={holdings}
            quotes={quoteMap}
            selectedSymbol={selected.symbol}
            onSelect={select}
          />
        </div>
      )}

      <div className="mt-2">
        {tab === "trade" && (
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <div role="tablist" aria-label="매매 화면" className="grid grid-cols-2 rounded-card border border-line bg-surface p-1 lg:hidden">
              {(
                [
                  ["chart", "차트·신호"],
                  ["order", "호가·체결"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tradePane === value}
                  onClick={() => setTradePane(value)}
                  className={cn(
                    "h-8 rounded-control text-sm font-medium transition",
                    tradePane === value ? "bg-fg text-bg" : "text-fg-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={cn("flex min-w-0 flex-col gap-2", paneOnly("chart"))}>
              {/* 오늘 수급 카드는 투자자 동향 탭에만 둔다 (매매 탭은 매매 신호의 수급 항목으로 본다) */}
              <Panel>
                <StockStats overview={o} />
                <div className="border-t border-line">
                  <ChartPanel symbol={selected.symbol} livePrice={o?.price ?? null} liveTime={o?.priceTime ?? null} />
                </div>
              </Panel>
              <Panel title="매매 신호">
                <AnalysisPanel symbol={selected.symbol} />
              </Panel>
            </div>

            <div className={cn("flex min-w-0 flex-col gap-2", paneOnly("order"))}>
              <Panel>
                <OrderbookPanel
                  symbol={selected.symbol}
                  prevClose={o?.prevClose ?? null}
                  currentPrice={o?.price ?? null}
                  // 모의투자 — onPickSide={pickSide}
                />
              </Panel>
              {/* 모의투자 — 주문
              <Panel>
                <OrderPanel
                  stock={selected}
                  price={o?.price ?? null}
                  cash={portfolio.data?.cash ?? 0}
                  heldQuantity={held?.quantity ?? 0}
                  side={side}
                  onSideChange={setSide}
                  onFilled={() => portfolio.refresh()}
                />
              </Panel>
              */}
              <Panel>
                <TradesPanel symbol={selected.symbol} prevClose={o?.prevClose ?? null} />
              </Panel>
            </div>
          </div>
        )}

        {tab === "valuation" && (
          <div className="grid gap-2">
            <Panel title="투자 지표">
              <ValuationPanel overview={o} />
            </Panel>
            <Panel title="재무 지표 (최근 3년)">
              <FinancialsPanel overview={o} />
            </Panel>
            <GlossaryList group="valuation" className="bg-surface" />
          </div>
        )}

        {tab === "investors" && (
          <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <Panel title="투자자 동향">
              {domestic && (
                <div className="border-b border-line">
                  <TodayFlowCard symbol={selected.symbol} volume={o?.volume ?? null} />
                </div>
              )}
              <InvestorFlowPanel symbol={selected.symbol} />
            </Panel>
            <Panel title="투자자별 순매수·순매도 상위" className="xl:self-start">
              <InvestorRankingPanel
                onSelect={(stock) => {
                  select(stock);
                  if (window.scrollY > 0) window.scrollTo({ top: 0 });
                }}
              />
            </Panel>
          </div>
        )}

        {tab === "market" && (
          <Panel>
            <MarketPanel market={market.data} error={market.error} index={marketIndex} onIndexChange={setMarketIndex} />
          </Panel>
        )}

        {/* 모의투자 — 계좌 탭
        {tab === "account" &&
          (portfolio.data ? (
            <AccountPanel
              portfolio={portfolio.data}
              selectedSymbol={selected.symbol}
              onSelect={(h) => {
                select(h);
                setTab("trade");
              }}
              onReset={reset}
            />
          ) : portfolio.error ? null : (
            <Skeleton className="h-60 w-full" />
          ))}
        */}
      </div>
    </Container>
  );
}
