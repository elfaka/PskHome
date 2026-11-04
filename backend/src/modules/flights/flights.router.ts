import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { getFlightsService } from "./flights.service.js";

/**
 * 항공권 최저가 검색 — `/api/flights/**` (로그인 필요)
 *
 * SerpApi 무료 한도(월 250회)를 익명 방문자가 소진하지 못하도록 Google 로그인 세션을 요구하고,
 * 사용자당 하루 검색 횟수도 제한한다.
 */
export const flightsRouter: Router = Router();

flightsRouter.use("/flights", requireAuth);

// 검색 — from=ICN&to=NRT&date=2026-12-01&tripType=oneway|round&returnDate=&adults=1
flightsRouter.get("/flights/search", async (req, res) => {
  const service = getFlightsService();
  const query = service.parseSearchQuery(req.query as Record<string, unknown>);
  res.json(await service.search(req.user!.id, query));
});

// 오늘 남은 검색 횟수
flightsRouter.get("/flights/quota", (req, res) => {
  res.json({ remainingSearches: getFlightsService().remaining(req.user!.id) });
});
