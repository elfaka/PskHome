"use client";

import { useState } from "react";

import { placeOrder, type OrderResult, type OrderSide } from "@/api/stockSim";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { cardClass } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errorMessage";
import { formatWon, maxBuyable } from "@/lib/stocksim/format";

const SIDE_LABEL: Record<OrderSide, string> = { BUY: "매수", SELL: "매도" };

/**
 * 시장가 주문. 표시되는 예상 금액은 화면의 현재가 기준이고,
 * 실제 체결가는 서버가 주문 순간 토스에서 다시 조회한 현재가다.
 */
export default function OrderPanel({
  stock,
  price,
  cash,
  heldQuantity,
  onFilled,
}: {
  stock: { symbol: string; name: string } | null;
  price: number | null;
  cash: number;
  heldQuantity: number;
  onFilled: (result: OrderResult) => void;
}) {
  const [side, setSide] = useState<OrderSide>("BUY");
  const [quantityText, setQuantityText] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);

  const quantity = Number(quantityText);
  const validQuantity = Number.isInteger(quantity) && quantity > 0;
  const max = side === "BUY" ? maxBuyable(cash, price) : heldQuantity;
  const estimate = validQuantity && price ? price * quantity : null;
  const canSubmit = !!stock && !!price && validQuantity && quantity <= max && !submitting;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stock || !canSubmit) return;

    setSubmitting(true);
    setMessage(null);
    try {
      const result = await placeOrder({ symbol: stock.symbol, side, quantity });
      const { trade } = result;
      setMessage({
        tone: "info",
        text: `${trade.name} ${trade.quantity}주 ${SIDE_LABEL[trade.side]} 체결 · ${formatWon(trade.price)} (총 ${formatWon(trade.amount)})`,
      });
      onFilled(result);
    } catch (err) {
      setMessage({ tone: "danger", text: errorMessage(err, "주문에 실패했습니다.") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className={cardClass({ className: "flex flex-col gap-4 p-4" })} aria-label="주문">
      <div className="text-sm font-semibold text-fg">주문</div>

      <div role="group" aria-label="주문 종류" className="grid grid-cols-2 gap-1 rounded-control bg-surface-2 p-1">
        {(["BUY", "SELL"] as OrderSide[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => setSide(s)}
            className={cn(
              "h-9 rounded-control text-sm font-medium transition",
              side === s
                ? s === "BUY"
                  ? "bg-danger-soft text-danger-soft-fg shadow-card"
                  : "bg-info-soft text-info-soft-fg shadow-card"
                : "text-fg-muted hover:text-fg"
            )}
          >
            {SIDE_LABEL[s]}
          </button>
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-fg-muted">종목</dt>
        <dd className="truncate text-right text-fg">{stock?.name ?? "-"}</dd>
        <dt className="text-fg-muted">현재가</dt>
        <dd className="text-right text-fg">{price ? formatWon(price) : "-"}</dd>
        <dt className="text-fg-muted">{side === "BUY" ? "매수 가능" : "보유"}</dt>
        <dd className="text-right text-fg">{max.toLocaleString("ko-KR")}주</dd>
      </dl>

      <Field label="수량 (주)" htmlFor="stocksim-quantity">
        <div className="flex gap-2">
          <Input
            id="stocksim-quantity"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={quantityText}
            onChange={(e) => setQuantityText(e.target.value)}
          />
          <Button type="button" onClick={() => setQuantityText(String(max))} disabled={max < 1}>
            최대
          </Button>
        </div>
      </Field>

      <div className="flex items-baseline justify-between border-t border-line pt-3 text-sm">
        <span className="text-fg-muted">예상 금액</span>
        <span className="text-base font-semibold text-fg">{estimate == null ? "-" : formatWon(estimate)}</span>
      </div>

      {validQuantity && quantity > max && (
        <p className="text-xs text-danger-soft-fg">
          {side === "BUY" ? "예수금이 부족합니다." : "보유 수량보다 많이 팔 수 없습니다."}
        </p>
      )}

      <Button type="submit" variant={side === "BUY" ? "danger" : "primary"} disabled={!canSubmit} full>
        {submitting ? "주문 중..." : `시장가 ${SIDE_LABEL[side]}`}
      </Button>

      {message && (
        <Alert tone={message.tone} className="text-sm">
          {message.text}
        </Alert>
      )}

      <p className="text-xs leading-5 text-fg-subtle">
        가상 체결입니다. 실제 계좌로 주문이 나가지 않으며, 체결가는 주문 순간의 토스증권 현재가입니다.
      </p>
    </form>
  );
}
