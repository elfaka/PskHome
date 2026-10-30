"use client";

import { useState } from "react";

import { placeOrder, type OrderResult, type OrderSide } from "@/api/stockSim";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errorMessage";
import { formatWon, maxBuyable } from "@/lib/stocksim/format";

const SIDE_LABEL: Record<OrderSide, string> = { BUY: "매수", SELL: "매도" };
const RATIOS = [
  { label: "10%", value: 0.1 },
  { label: "25%", value: 0.25 },
  { label: "50%", value: 0.5 },
  { label: "최대", value: 1 },
];

/**
 * 시장가 주문. 표시되는 예상 금액은 화면의 현재가 기준이고,
 * 실제 체결가는 서버가 주문 순간 토스에서 다시 조회한 현재가다.
 *
 * 매수·매도 선택은 부모가 쥐고 있다 — 호가창을 누르면 바뀌어야 하기 때문이다.
 */
export default function OrderPanel({
  stock,
  price,
  cash,
  heldQuantity,
  side,
  onSideChange,
  onFilled,
}: {
  stock: { symbol: string; name: string } | null;
  price: number | null;
  cash: number;
  heldQuantity: number;
  side: OrderSide;
  onSideChange: (side: OrderSide) => void;
  onFilled: (result: OrderResult) => void;
}) {
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
    <form onSubmit={submit} className="flex flex-col gap-3 p-3" aria-label="주문">
      <div role="group" aria-label="주문 종류" className="grid grid-cols-2 gap-1 rounded-control bg-surface-2 p-1">
        {(["BUY", "SELL"] as OrderSide[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => onSideChange(s)}
            className={cn(
              "h-9 rounded-control text-sm font-semibold transition",
              side === s
                ? s === "BUY"
                  ? "bg-danger text-surface shadow-card"
                  : "bg-info text-surface shadow-card"
                : "text-fg-muted hover:text-fg"
            )}
          >
            {SIDE_LABEL[s]}
          </button>
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-y-1 text-xs">
        <dt className="text-fg-subtle">주문 유형</dt>
        <dd className="text-right text-fg">시장가</dd>
        <dt className="text-fg-subtle">현재가</dt>
        <dd className="text-right tabular-nums text-fg">{price ? formatWon(price) : "-"}</dd>
        <dt className="text-fg-subtle">{side === "BUY" ? "주문 가능 금액" : "보유 수량"}</dt>
        <dd className="text-right tabular-nums text-fg">
          {side === "BUY" ? formatWon(cash) : `${heldQuantity.toLocaleString("ko-KR")}주`}
        </dd>
        <dt className="text-fg-subtle">{side === "BUY" ? "매수 가능" : "매도 가능"}</dt>
        <dd className="text-right tabular-nums text-fg">{max.toLocaleString("ko-KR")}주</dd>
      </dl>

      <div>
        <label htmlFor="stocksim-quantity" className="mb-1 block text-xs text-fg-muted">
          수량 (주)
        </label>
        <Input
          id="stocksim-quantity"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={quantityText}
          onChange={(e) => setQuantityText(e.target.value)}
          className="text-right tabular-nums"
        />
        <div className="mt-1.5 grid grid-cols-4 gap-1">
          {RATIOS.map((r) => (
            <Button
              key={r.label}
              type="button"
              size="sm"
              onClick={() => setQuantityText(String(Math.max(r.value === 1 ? max : Math.floor(max * r.value), 0)))}
              disabled={max < 1}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-baseline justify-between border-t border-line pt-3 text-sm">
        <span className="text-fg-muted">예상 금액</span>
        <span className="text-base font-semibold tabular-nums text-fg">{estimate == null ? "-" : formatWon(estimate)}</span>
      </div>

      {validQuantity && quantity > max && (
        <p className="text-xs text-danger-soft-fg">
          {side === "BUY" ? "예수금이 부족합니다." : "보유 수량보다 많이 팔 수 없습니다."}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className={cn(
          "h-11 rounded-control text-sm font-semibold text-surface shadow-card transition disabled:cursor-not-allowed disabled:opacity-50",
          side === "BUY" ? "bg-danger" : "bg-info"
        )}
      >
        {submitting ? "주문 중..." : `시장가 ${SIDE_LABEL[side]}`}
      </button>

      {message && (
        <Alert tone={message.tone} className="text-xs">
          {message.text}
        </Alert>
      )}

      <p className="text-[11px] leading-4 text-fg-subtle">
        가상 체결입니다. 실제 계좌로 주문이 나가지 않으며, 체결가는 주문 순간의 토스증권 현재가입니다.
      </p>
    </form>
  );
}
