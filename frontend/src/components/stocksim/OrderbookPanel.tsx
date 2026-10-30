"use client";

import { getOrderbook, type OrderSide } from "@/api/stockSim";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { changeTone, formatNumber, formatRate, TONE_TEXT } from "@/lib/stocksim/format";
import { usePolling } from "@/lib/stocksim/usePolling";

const REFRESH_MS = 3_000;

/**
 * 10단계 호가창 — 위는 매도호가(파랑 잔량), 아래는 매수호가(빨강 잔량), 가운데가 가격.
 * 가격은 전일 종가 대비로 색을 칠하고, 현재가와 같은 호가는 테두리로 표시한다.
 *
 * 매도호가를 누르면 매수, 매수호가를 누르면 매도로 주문창을 바꾼다.
 * (모의투자는 시장가만 있어 가격은 넘기지 않는다)
 */
export default function OrderbookPanel({
  symbol,
  prevClose,
  currentPrice,
  onPickSide,
}: {
  symbol: string;
  prevClose: number | null;
  currentPrice: number | null;
  onPickSide: (side: OrderSide) => void;
}) {
  const { data: book, error } = usePolling(symbol, () => getOrderbook(symbol), REFRESH_MS, "호가를 불러오지 못했습니다.");

  const maxVolume = book ? Math.max(1, ...book.asks.map((l) => l.volume), ...book.bids.map((l) => l.volume)) : 1;

  const priceCell = (price: number) => {
    const rate = prevClose ? (price - prevClose) / prevClose : null;
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center border-x border-line px-1 tabular-nums",
          price === currentPrice && "outline outline-1 -outline-offset-1 outline-fg"
        )}
      >
        <span className={cn("text-[13px] font-semibold leading-tight", prevClose ? TONE_TEXT[changeTone(price - prevClose)] : "text-fg")}>
          {formatNumber(price)}
        </span>
        {rate != null && <span className="text-[10px] leading-tight text-fg-subtle">{formatRate(rate)}</span>}
      </div>
    );
  };

  const bar = (volume: number, side: "ask" | "bid") => (
    <div className={cn("relative flex h-full items-center px-2 text-xs tabular-nums", side === "ask" ? "justify-end" : "justify-start")}>
      <div
        aria-hidden
        className={cn(
          "absolute inset-y-1 opacity-20",
          side === "ask" ? "right-0 bg-info" : "left-0 bg-danger"
        )}
        style={{ width: `${(volume / maxVolume) * 100}%` }}
      />
      <span className="relative text-fg">{formatNumber(volume)}</span>
    </div>
  );

  return (
    <section aria-label="호가" className="flex flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="text-sm font-semibold text-fg">호가</h2>
        <span className="text-[11px] text-fg-subtle">3초마다 갱신 · 누르면 주문</span>
      </div>

      {error && !book && (
        <p role="alert" className="px-3 py-6 text-center text-sm text-danger-soft-fg">
          {error}
        </p>
      )}

      {!book && !error && <Skeleton className="m-3 h-[30rem]" />}

      {book && (
        <div className="text-sm">
          <ul aria-label="매도호가">
            {book.asks.map((l) => (
              <li key={`a${l.price}`}>
                <button
                  type="button"
                  onClick={() => onPickSide("BUY")}
                  aria-label={`매도호가 ${formatNumber(l.price)}원 잔량 ${formatNumber(l.volume)}주, 매수 주문`}
                  className="grid h-8 w-full grid-cols-[1fr_6.5rem_1fr] bg-info-soft/40 transition hover:bg-info-soft"
                >
                  {bar(l.volume, "ask")}
                  {priceCell(l.price)}
                  <span />
                </button>
              </li>
            ))}
          </ul>
          <ul aria-label="매수호가">
            {book.bids.map((l) => (
              <li key={`b${l.price}`}>
                <button
                  type="button"
                  onClick={() => onPickSide("SELL")}
                  aria-label={`매수호가 ${formatNumber(l.price)}원 잔량 ${formatNumber(l.volume)}주, 매도 주문`}
                  className="grid h-8 w-full grid-cols-[1fr_6.5rem_1fr] bg-danger-soft/40 transition hover:bg-danger-soft"
                >
                  <span />
                  {priceCell(l.price)}
                  {bar(l.volume, "bid")}
                </button>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-[1fr_6.5rem_1fr] border-t border-line text-xs tabular-nums">
            <span className="px-2 py-1.5 text-right text-info-soft-fg">{formatNumber(book.totalAskVolume)}</span>
            <span className="py-1.5 text-center text-fg-subtle">잔량 합계</span>
            <span className="px-2 py-1.5 text-danger-soft-fg">{formatNumber(book.totalBidVolume)}</span>
          </div>
        </div>
      )}
    </section>
  );
}
