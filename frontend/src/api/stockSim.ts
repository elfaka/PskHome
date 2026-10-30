import { api } from "./client";

/**
 * 주식 모의투자 API (`/api/stocksim/**`).
 *
 * 시세·호가·수급은 백엔드가 토스증권 Open API 에서, 재무 지표는 OpenDART 에서 받아온다.
 * 주문은 백엔드 세션 안에서만 가상 체결되고 실제 계좌로는 나가지 않는다.
 * 체결가는 서버가 정하므로 주문 요청에 가격을 넣지 않는다.
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

export type QuoteWithChange = Quote & {
  prevClose: number | null;
  change: number | null;
  changeRate: number | null;
};

export type CandlePoint = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/** 차트 봉 단위 */
export type Timeframe = "1m" | "5m" | "15m" | "1d" | "1w" | "1M";

export type ChartData = {
  symbol: string;
  timeframe: Timeframe;
  /** 오래된 것부터 */
  candles: CandlePoint[];
  /** candles 와 같은 길이·순서. 계산에 데이터가 모자란 앞부분은 null */
  indicators: {
    ma5: (number | null)[];
    ma20: (number | null)[];
    ma60: (number | null)[];
    ma120: (number | null)[];
    bollinger: { middle: number | null; upper: number | null; lower: number | null }[];
    rsi: (number | null)[];
    macd: { macd: number | null; signal: number | null; histogram: number | null }[];
  };
};

export type OrderbookLevel = { price: number; volume: number };

export type Orderbook = {
  timestamp: string | null;
  /** 높은 가격순 (마지막이 최우선 매도호가) */
  asks: OrderbookLevel[];
  /** 높은 가격순 (첫 번째가 최우선 매수호가) */
  bids: OrderbookLevel[];
  totalAskVolume: number;
  totalBidVolume: number;
};

export type TradeTick = { price: number; volume: number; time: string };

export type InvestorFlowDay = {
  date: string;
  individual: number | null;
  foreigner: number;
  institution: number;
  otherCorporation: number | null;
  foreignerHoldingRate: number | null;
  shortSellingRate: number | null;
};

export type Valuation = {
  basis: string;
  bsnsYear: number;
  consolidated: boolean;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  totalEquity: number | null;
  totalLiabilities: number | null;
  eps: number | null;
  bps: number | null;
  per: number | null;
  pbr: number | null;
  roe: number | null;
  operatingMargin: number | null;
  debtRatio: number | null;
  dividendPerShare: number | null;
  dividendYield: number | null;
};

export type StockOverview = {
  symbol: string;
  name: string;
  market: string;
  securityType: string;
  currency: "KRW" | "USD";
  tradingSuspended: boolean;
  price: number | null;
  priceTime: string | null;
  prevClose: number | null;
  change: number | null;
  changeRate: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  high52w: number | null;
  low52w: number | null;
  upperLimit: number | null;
  lowerLimit: number | null;
  sharesOutstanding: number | null;
  marketCap: number | null;
  valuation: Valuation | null;
  valuationNote: string | null;
};

export type Rating = "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";

export type FactorCategory = "trend" | "momentum" | "position" | "flow" | "valuation";

export type AnalysisFactor = {
  key: string;
  category: FactorCategory;
  label: string;
  score: number;
  maxScore: number;
  signal: "positive" | "negative" | "neutral" | "unavailable" | "info";
  reason: string;
};

export type Analysis = {
  symbol: string;
  name: string;
  asOf: string;
  price: number;
  /** -100 ~ 100 */
  score: number;
  rating: Rating;
  ratingLabel: string;
  summary: string;
  factors: AnalysisFactor[];
  indicators: {
    ma5: number | null;
    ma20: number | null;
    ma60: number | null;
    ma120: number | null;
    rsi14: number | null;
    macd: number | null;
    macdSignal: number | null;
    bollingerUpper: number | null;
    bollingerLower: number | null;
    high52w: number | null;
    low52w: number | null;
    return1y: number | null;
    maxDrawdown1y: number | null;
  };
  disclaimer: string;
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

const path = (symbol: string) => encodeURIComponent(symbol);

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

/** 관심종목용 — 현재가 + 전일 대비 */
export async function getQuotesWithChange(symbols: string[]) {
  const { data } = await api.get<QuoteWithChange[]>("/api/stocksim/quotes", {
    params: { symbols: symbols.join(","), change: 1 },
  });
  return data;
}

export async function getChart(symbol: string, timeframe: Timeframe) {
  const { data } = await api.get<ChartData>(`/api/stocksim/chart/${path(symbol)}`, { params: { timeframe } });
  return data;
}

export async function getOverview(symbol: string) {
  const { data } = await api.get<StockOverview>(`/api/stocksim/stocks/${path(symbol)}/overview`);
  return data;
}

export async function getAnalysis(symbol: string) {
  const { data } = await api.get<Analysis>(`/api/stocksim/stocks/${path(symbol)}/analysis`);
  return data;
}

export async function getInvestorFlows(symbol: string) {
  const { data } = await api.get<InvestorFlowDay[]>(`/api/stocksim/stocks/${path(symbol)}/investors`);
  return data;
}

export async function getOrderbook(symbol: string) {
  const { data } = await api.get<Orderbook>(`/api/stocksim/orderbook/${path(symbol)}`);
  return data;
}

export async function getTrades(symbol: string) {
  const { data } = await api.get<TradeTick[]>(`/api/stocksim/trades/${path(symbol)}`);
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
