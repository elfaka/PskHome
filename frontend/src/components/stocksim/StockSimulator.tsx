"use client";

import { useEffect, useState } from "react";

import {
  getDailyCandles,
  getPortfolio,
  getQuotes,
  resetPortfolio,
  type CandlePoint,
  type OrderResult,
  type Portfolio,
  type Quote,
} from "@/api/stockSim";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { cardClass } from "@/components/ui/Card";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errorMessage";
import { previousClose } from "@/lib/stocksim/candles";
import { changeTone, formatRate, formatShortTime, formatSignedWon, formatWon, TONE_TEXT } from "@/lib/stocksim/format";

import OrderPanel from "./OrderPanel";
import { HoldingsTable, PortfolioSummary, TradeHistory } from "./PortfolioSections";
import PriceChart from "./PriceChart";
import StockSearch from "./StockSearch";

/** 화면에서 고른 종목. 보유 목록에서 고르면 시장 정보가 없다. */
type SelectedStock = { symbol: string; name: string; market?: string };

const DEFAULT_STOCK: SelectedStock = { symbol: "005930", name: "삼성전자", market: "KOSPI" };
/** 토스 시세는 REST 만 있어 폴링한다. 백엔드가 3초 캐시하므로 이보다 자주 부를 이유가 없다. */
const QUOTE_REFRESH_MS = 10_000;
const CANDLE_COUNT = 60;

/**
 * 주식 모의투자 화면.
 *
 * 포트폴리오는 백엔드 세션에 있다 (로그인 불필요, 재배포 시 초기화).
 * 이 컴포넌트는 선택 종목·시세·포트폴리오를 들고 하위 패널에 내려준다.
 */
export default function StockSimulator() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  const [selected, setSelected] = useState<SelectedStock>(DEFAULT_STOCK);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [marketError, setMarketError] = useState<string | null>(null);

  // 보유 종목 평가금액도 시세를 따라 움직이도록 같은 주기로 다시 받는다.
  useEffect(() => {
    let cancelled = false;

    const loadPortfolio = async () => {
      try {
        const next = await getPortfolio();
        if (cancelled) return;
        setPortfolio(next);
        setPortfolioError(null);
      } catch (e) {
        if (!cancelled) setPortfolioError(errorMessage(e, "포트폴리오를 불러오지 못했습니다."));
      }
    };

    void loadPortfolio();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadPortfolio();
    }, QUOTE_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // 선택 종목의 현재가·일봉. 현재가는 탭이 보일 때만 주기적으로 갱신한다.
  useEffect(() => {
    let cancelled = false;

    const refreshQuote = async () => {
      try {
        const [q] = await getQuotes([selected.symbol]);
        if (cancelled) return;
        setQuote(q ?? null);
        setMarketError(q ? null : "현재가를 받지 못한 종목입니다.");
      } catch (e) {
        if (!cancelled) setMarketError(errorMessage(e, "시세를 불러오지 못했습니다."));
      }
    };

    const loadCandles = async () => {
      try {
        const points = await getDailyCandles(selected.symbol, CANDLE_COUNT);
        if (!cancelled) setCandles(points);
      } catch {
        // 차트가 없어도 거래는 된다. 오류는 현재가 쪽에서 보여준다.
      }
    };

    void refreshQuote();
    void loadCandles();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refreshQuote();
    }, QUOTE_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected.symbol]);

  const select = (stock: SelectedStock) => {
    if (stock.symbol === selected.symbol) return;
    setSelected(stock);
    setQuote(null);
    setCandles([]);
    setMarketError(null);
  };

  const onFilled = (result: OrderResult) => {
    setPortfolio(result.portfolio);
    // 체결가가 화면 현재가보다 최신이므로 맞춰 둔다.
    setQuote((q) => (q && q.symbol === result.trade.symbol ? { ...q, price: result.trade.price } : q));
  };

  const reset = async () => {
    if (!window.confirm("예수금 1,000만 원으로 처음부터 다시 시작할까요? 보유 종목과 거래내역이 모두 지워집니다.")) {
      return;
    }
    try {
      setPortfolio(await resetPortfolio());
      setPortfolioError(null);
    } catch (e) {
      setPortfolioError(errorMessage(e, "초기화하지 못했습니다."));
    }
  };

  const held = portfolio?.holdings.find((h) => h.symbol === selected.symbol);
  const prevClose = previousClose(candles, quote?.timestamp ?? null);
  const change = quote && prevClose ? quote.price - prevClose : null;
  const tone = TONE_TEXT[changeTone(change)];

  return (
    <Container size="wide" className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Tool"
        title="주식 모의투자"
        description="토스증권 실시세로 가상 예수금 1,000만 원을 굴려 봅니다. 실제 주문은 나가지 않습니다."
        actions={
          <>
            <Badge>시세: 토스증권 Open API</Badge>
            <Button size="sm" onClick={reset}>
              초기화
            </Button>
          </>
        }
      />

      <div className="mt-8 space-y-4">
        {portfolioError && <Alert>{portfolioError}</Alert>}

        {portfolio ? (
          <PortfolioSummary portfolio={portfolio} />
        ) : (
          !portfolioError && <Skeleton className="h-24 w-full" />
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className={cardClass({ className: "p-4" })} aria-label="시세">
            <StockSearch onSelect={select} />

            <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-lg font-semibold text-fg">{selected.name}</h2>
                  <span className="font-mono text-xs text-fg-subtle">{selected.symbol}</span>
                  {selected.market && <Badge>{selected.market}</Badge>}
                </div>

                <div className="mt-1 flex items-baseline gap-2">
                  {quote ? (
                    <>
                      <span className={cn("text-3xl font-semibold tabular-nums", tone)}>
                        {formatWon(quote.price)}
                      </span>
                      {change != null && prevClose && (
                        <span className={cn("text-sm tabular-nums", tone)}>
                          {formatSignedWon(change)} ({formatRate(change / prevClose)})
                        </span>
                      )}
                    </>
                  ) : (
                    !marketError && <Skeleton className="h-9 w-40" />
                  )}
                </div>
              </div>

              {quote?.timestamp && (
                <span className="text-xs text-fg-subtle">{formatShortTime(quote.timestamp)} 기준 · 10초마다 갱신</span>
              )}
            </div>

            {marketError && (
              <Alert className="mt-4" title="시세를 불러오지 못했습니다">
                {marketError}
              </Alert>
            )}

            <PriceChart points={candles} className="mt-4" />
          </section>

          <OrderPanel
            stock={selected}
            price={quote?.price ?? null}
            cash={portfolio?.cash ?? 0}
            heldQuantity={held?.quantity ?? 0}
            onFilled={onFilled}
          />
        </div>

        {portfolio && (
          <>
            <HoldingsTable
              holdings={portfolio.holdings}
              selectedSymbol={selected.symbol}
              onSelect={(h) => select({ symbol: h.symbol, name: h.name })}
            />
            <TradeHistory trades={portfolio.trades} />
          </>
        )}
      </div>
    </Container>
  );
}
