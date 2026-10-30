import { randomUUID } from "node:crypto";

import { HttpError } from "../../lib/httpError.js";
import * as marketData from "./marketData.service.js";
import {
  INITIAL_CASH,
  MAX_TRADES,
  type HoldingView,
  type OrderRequest,
  type OrderResult,
  type OrderSide,
  type PortfolioState,
  type PortfolioView,
  type TradeRecord,
} from "./stockSim.types.js";

/**
 * 모의투자 매매 규칙.
 *
 * [체결 방식]
 * 시장가 주문만 있고, 체결가는 **서버가 토스에서 조회한 현재가**다.
 * 클라이언트가 보낸 가격을 믿으면 원하는 가격에 사고팔 수 있으므로 가격은 요청에 받지 않는다.
 *
 * [초안 단계에서 뺀 것]
 * 수수료·세금, 장 운영시간 제한, 해외(USD) 종목, 지정가 주문.
 */

export function createPortfolio(now = new Date()): PortfolioState {
  return {
    initialCash: INITIAL_CASH,
    cash: INITIAL_CASH,
    realizedPnl: 0,
    holdings: {},
    trades: [],
    createdAt: now.toISOString(),
  };
}

interface Execution {
  symbol: string;
  name: string;
  side: OrderSide;
  quantity: number;
  price: number;
  executedAt: Date;
}

/**
 * 체결 하나를 포트폴리오에 반영한다. 원본은 건드리지 않고 새 상태를 돌려준다.
 */
export function applyExecution(state: PortfolioState, exec: Execution): { state: PortfolioState; trade: TradeRecord } {
  const amount = exec.price * exec.quantity;
  const holdings = { ...state.holdings };
  const current = holdings[exec.symbol];
  let cash = state.cash;
  let realizedPnl: number | null = null;

  if (exec.side === "BUY") {
    if (amount > cash) {
      throw HttpError.badRequest(
        `예수금이 부족합니다. (필요 ${amount.toLocaleString("ko-KR")}원, 보유 ${cash.toLocaleString("ko-KR")}원)`,
        "INSUFFICIENT_CASH"
      );
    }

    cash -= amount;
    holdings[exec.symbol] = {
      symbol: exec.symbol,
      name: exec.name,
      quantity: (current?.quantity ?? 0) + exec.quantity,
      costBasis: (current?.costBasis ?? 0) + amount,
    };
  } else {
    if (!current || current.quantity < exec.quantity) {
      throw HttpError.badRequest(
        `보유 수량이 부족합니다. (보유 ${current?.quantity ?? 0}주)`,
        "INSUFFICIENT_QUANTITY"
      );
    }

    // 평균단가는 매도로 바뀌지 않는다 → 판 비율만큼 매입원가를 덜어낸다.
    const soldCost = (current.costBasis * exec.quantity) / current.quantity;
    realizedPnl = amount - soldCost;
    cash += amount;

    const remaining = current.quantity - exec.quantity;
    if (remaining === 0) {
      delete holdings[exec.symbol];
    } else {
      holdings[exec.symbol] = { ...current, quantity: remaining, costBasis: current.costBasis - soldCost };
    }
  }

  const trade: TradeRecord = {
    id: randomUUID(),
    symbol: exec.symbol,
    name: exec.name,
    side: exec.side,
    quantity: exec.quantity,
    price: exec.price,
    amount,
    realizedPnl,
    executedAt: exec.executedAt.toISOString(),
  };

  return {
    trade,
    state: {
      ...state,
      cash,
      holdings,
      realizedPnl: state.realizedPnl + (realizedPnl ?? 0),
      trades: [trade, ...state.trades].slice(0, MAX_TRADES),
    },
  };
}

/**
 * 현재가로 포트폴리오를 평가한다. 가격이 없는 종목은 매입원가로 대신 계산한다.
 */
export function valuate(state: PortfolioState, prices: Map<string, number>): PortfolioView {
  const holdings: HoldingView[] = Object.values(state.holdings).map((h) => {
    const currentPrice = prices.get(h.symbol) ?? null;
    const marketValue = currentPrice == null ? h.costBasis : currentPrice * h.quantity;
    const unrealizedPnl = currentPrice == null ? null : marketValue - h.costBasis;

    return {
      symbol: h.symbol,
      name: h.name,
      quantity: h.quantity,
      avgPrice: h.costBasis / h.quantity,
      costBasis: h.costBasis,
      currentPrice,
      marketValue,
      unrealizedPnl,
      returnRate: unrealizedPnl == null || h.costBasis === 0 ? null : unrealizedPnl / h.costBasis,
    };
  });

  const totalMarketValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  const totalAssets = state.cash + totalMarketValue;
  const totalPnl = totalAssets - state.initialCash;

  return {
    initialCash: state.initialCash,
    cash: state.cash,
    holdings,
    totalMarketValue,
    totalAssets,
    totalPnl,
    totalReturnRate: totalPnl / state.initialCash,
    realizedPnl: state.realizedPnl,
    trades: state.trades,
    createdAt: state.createdAt,
  };
}

/** 보유 종목 현재가를 받아와 평가한다. 시세 조회가 실패해도 포트폴리오는 보여준다. */
export async function getPortfolioView(state: PortfolioState): Promise<PortfolioView> {
  const symbols = Object.keys(state.holdings);
  const prices = new Map<string, number>();

  if (symbols.length > 0) {
    try {
      for (const q of await marketData.getQuotes(symbols)) prices.set(q.symbol, q.price);
    } catch {
      // 시세 없이 매입원가 기준으로 보여준다 (currentPrice = null).
    }
  }

  return valuate(state, prices);
}

/**
 * 시장가 주문을 체결한다.
 * 종목 정보로 거래 가능 여부를 먼저 확인하고, 그 다음 현재가로 체결한다.
 */
export async function placeOrder(
  state: PortfolioState,
  order: OrderRequest
): Promise<{ state: PortfolioState; result: OrderResult }> {
  const stock = await marketData.getStock(order.symbol);

  if (stock.currency !== "KRW" || (stock.market !== "KOSPI" && stock.market !== "KOSDAQ")) {
    throw HttpError.badRequest("국내(KOSPI·KOSDAQ) 종목만 거래할 수 있습니다.", "UNSUPPORTED_SYMBOL");
  }
  if (stock.status !== "ACTIVE") {
    throw HttpError.badRequest("상장 중인 종목만 거래할 수 있습니다.", "UNSUPPORTED_SYMBOL");
  }
  if (stock.koreanMarketDetail?.krxTradingSuspended) {
    throw HttpError.badRequest("거래정지 종목입니다.", "TRADING_SUSPENDED");
  }

  const quote = await marketData.getQuote(stock.symbol);
  const { state: next, trade } = applyExecution(state, {
    symbol: stock.symbol,
    name: stock.name,
    side: order.side,
    quantity: order.quantity,
    price: quote.price,
    executedAt: new Date(),
  });

  return { state: next, result: { trade, portfolio: await getPortfolioView(next) } };
}
