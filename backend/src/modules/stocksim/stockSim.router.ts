import { Router, type Request } from "express";
import { z } from "zod";

import { HttpError } from "../../lib/httpError.js";
import { getAnalysis } from "./analysis.service.js";
import * as marketData from "./marketData.service.js";
import { getOverview } from "./overview.service.js";
import * as stockSimService from "./stockSim.service.js";
import type { PortfolioState, Timeframe } from "./stockSim.types.js";

/**
 * 주식 모의투자 — `/api/stocksim/**` (공개)
 *
 * 로그인 없이 쓰고, 포트폴리오는 브라우저 세션에 둔다.
 * 시세 조회만 하는 방문자에게는 세션을 만들지 않는다 (`saveUninitialized: false` 이므로
 * `req.session.stocksim` 에 값을 넣는 주문/초기화 때 처음 쿠키가 나간다).
 */
export const stockSimRouter: Router = Router();

const orderSchema = z.object({
  symbol: z.string().trim().min(1),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().int().positive().max(1_000_000),
});

function portfolioOf(req: Request): PortfolioState {
  return req.session.stocksim ?? stockSimService.createPortfolio();
}

const TIMEFRAMES: readonly Timeframe[] = ["1m", "5m", "15m", "1d", "1w", "1M"];

function parseTimeframe(raw: unknown): Timeframe {
  if (raw == null) return "1d";
  if (typeof raw === "string" && (TIMEFRAMES as readonly string[]).includes(raw)) return raw as Timeframe;

  throw HttpError.badRequest(`timeframe 은 ${TIMEFRAMES.join(", ")} 중 하나여야 합니다.`, "INVALID_PARAM");
}

// 종목 검색 (이름 또는 코드)
stockSimRouter.get("/stocksim/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  res.json(await marketData.searchStocks(q));
});

// 현재가 다건 조회 — symbols=005930,000660 (change=1 이면 전일 대비 포함)
stockSimRouter.get("/stocksim/quotes", async (req, res) => {
  const raw = typeof req.query.symbols === "string" ? req.query.symbols : "";
  const symbols = raw.split(",");
  res.json(req.query.change === "1" ? await marketData.getQuotesWithChange(symbols) : await marketData.getQuotes(symbols));
});

// 차트 — 봉(오래된 것부터) + 같은 길이의 지표 배열 (이동평균·볼린저·RSI·MACD)
stockSimRouter.get("/stocksim/chart/:symbol", async (req, res) => {
  res.json(await marketData.getChart(req.params.symbol, parseTimeframe(req.query.timeframe)));
});

// 종목 개요 — 현재가·시고저·52주·상하한가·시가총액·재무 지표
stockSimRouter.get("/stocksim/stocks/:symbol/overview", async (req, res) => {
  res.json(await getOverview(req.params.symbol));
});

// 매수·매도 추천 (규칙 기반, 항목별 사유 포함)
stockSimRouter.get("/stocksim/stocks/:symbol/analysis", async (req, res) => {
  res.json(await getAnalysis(req.params.symbol));
});

// 최근 20거래일 투자자별 순매수·공매도 비중 (최신순)
stockSimRouter.get("/stocksim/stocks/:symbol/investors", async (req, res) => {
  res.json(await marketData.getInvestorFlows(req.params.symbol));
});

// 10단계 호가
stockSimRouter.get("/stocksim/orderbook/:symbol", async (req, res) => {
  res.json(await marketData.getOrderbook(req.params.symbol));
});

// 당일 최근 체결 (최신순)
stockSimRouter.get("/stocksim/trades/:symbol", async (req, res) => {
  res.json(await marketData.getTrades(req.params.symbol));
});

stockSimRouter.get("/stocksim/portfolio", async (req, res) => {
  res.json(await stockSimService.getPortfolioView(portfolioOf(req)));
});

// 시장가 주문 — 가격은 받지 않는다 (서버가 토스 현재가로 체결)
stockSimRouter.post("/stocksim/orders", async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw HttpError.badRequest(`잘못된 주문입니다. ${detail}`, "INVALID_ORDER");
  }

  const { state, result } = await stockSimService.placeOrder(portfolioOf(req), parsed.data);
  req.session.stocksim = state;

  res.json(result);
});

stockSimRouter.post("/stocksim/reset", async (req, res) => {
  const state = stockSimService.createPortfolio();
  req.session.stocksim = state;

  res.json(await stockSimService.getPortfolioView(state));
});
