import { Router, type Request } from "express";
import { z } from "zod";

import { HttpError } from "../../lib/httpError.js";
import * as marketData from "./marketData.service.js";
import * as stockSimService from "./stockSim.service.js";
import type { PortfolioState } from "./stockSim.types.js";

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

function parseCount(raw: unknown): number {
  if (raw == null) return 60;

  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    throw HttpError.badRequest("count 는 1~200 사이의 정수여야 합니다.", "INVALID_PARAM");
  }

  return count;
}

// 종목 검색 (이름 또는 코드)
stockSimRouter.get("/stocksim/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  res.json(await marketData.searchStocks(q));
});

// 현재가 다건 조회 — symbols=005930,000660
stockSimRouter.get("/stocksim/quotes", async (req, res) => {
  const raw = typeof req.query.symbols === "string" ? req.query.symbols : "";
  res.json(await marketData.getQuotes(raw.split(",")));
});

// 일봉 (오래된 것부터)
stockSimRouter.get("/stocksim/candles/:symbol", async (req, res) => {
  res.json(await marketData.getDailyCandles(req.params.symbol, parseCount(req.query.count)));
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
