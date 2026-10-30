import { api } from "./client";

/**
 * 주식 모의투자 API (`/api/stocksim/**`).
 *
 * 시세는 백엔드가 토스증권 Open API 에서 받아온다. 주문은 백엔드 세션 안에서만 가상 체결되고
 * 실제 계좌로는 나가지 않는다. 체결가는 서버가 정하므로 주문 요청에 가격을 넣지 않는다.
 */

export type OrderSide = "BUY" | "SELL";

export type StockSearchItem = {
  symbol: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  securityType: string;
};

export type Quote = {
  symbol: string;
  price: number;
  currency: "KRW" | "USD";
  timestamp: string | null;
};

export type CandlePoint = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Trade = {
  id: string;
  symbol: string;
  name: string;
  side: OrderSide;
  quantity: number;
  price: number;
  amount: number;
  realizedPnl: number | null;
  executedAt: string;
};

export type Holding = {
  symbol: string;
  name: string;
  quantity: number;
  avgPrice: number;
  costBasis: number;
  /** 시세를 못 받아오면 null (평가금액은 매입원가로 대신한다) */
  currentPrice: number | null;
  marketValue: number;
  unrealizedPnl: number | null;
  /** 0.05 = 5% */
  returnRate: number | null;
};

export type Portfolio = {
  initialCash: number;
  cash: number;
  holdings: Holding[];
  totalMarketValue: number;
  totalAssets: number;
  totalPnl: number;
  totalReturnRate: number;
  realizedPnl: number;
  trades: Trade[];
  createdAt: string;
};

export type OrderRequest = {
  symbol: string;
  side: OrderSide;
  quantity: number;
};

export type OrderResult = {
  trade: Trade;
  portfolio: Portfolio;
};

export async function searchStocks(q: string) {
  const { data } = await api.get<StockSearchItem[]>("/api/stocksim/search", { params: { q } });
  return data;
}

export async function getQuotes(symbols: string[]) {
  const { data } = await api.get<Quote[]>("/api/stocksim/quotes", {
    params: { symbols: symbols.join(",") },
  });
  return data;
}

export async function getDailyCandles(symbol: string, count = 60) {
  const { data } = await api.get<CandlePoint[]>(
    `/api/stocksim/candles/${encodeURIComponent(symbol)}`,
    { params: { count } }
  );
  return data;
}

export async function getPortfolio() {
  const { data } = await api.get<Portfolio>("/api/stocksim/portfolio");
  return data;
}

export async function placeOrder(order: OrderRequest) {
  const { data } = await api.post<OrderResult>("/api/stocksim/orders", order);
  return data;
}

export async function resetPortfolio() {
  const { data } = await api.post<Portfolio>("/api/stocksim/reset");
  return data;
}
