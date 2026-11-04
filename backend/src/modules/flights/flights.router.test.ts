import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParsedFlightSearch } from "./flights.types.js";

// 테스트가 실제 SerpApi 를 부르지 않도록 클라이언트를 바꾼다 (backend/.env 에 키가 있어도)
const holder = vi.hoisted(() => ({
  searchFlights: null as unknown as ReturnType<typeof vi.fn>,
}));
vi.mock("./serpapi/serpApiClient.js", () => ({
  getSerpApiClient: () => ({ searchFlights: holder.searchFlights }),
}));

const { createApp } = await import("../../app.js");
const { errorHandler } = await import("../../middleware/errorHandler.js");
const { flightsRouter } = await import("./flights.router.js");

const result: ParsedFlightSearch = {
  options: [
    {
      id: "KE 703@2026-12-01 09:00",
      price: 320000,
      totalDurationMinutes: 140,
      stops: 0,
      airlines: ["대한항공"],
      departureTime: "2026-12-01 09:00",
      arrivalTime: "2026-12-01 11:20",
      segments: [],
      layovers: [],
      best: true,
    },
  ],
  priceInsights: null,
  googleFlightsUrl: null,
};

/** 로그인된 요청을 흉내 내는 앱 (Google 로그인 플로우는 외부 의존이라 건너뛴다) */
function loggedInApp(userId = "user-1") {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: userId, name: "테스터", accessToken: "t" };
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    next();
  });
  app.use("/api", flightsRouter);
  app.use(errorHandler);
  return app;
}

function futureDate(days: number): string {
  const d = new Date(Date.now() + 9 * 3600_000);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("flights routes", () => {
  beforeEach(() => {
    holder.searchFlights = vi.fn(async () => result);
  });

  it.each(["/api/flights/search?from=ICN&to=NRT&date=2026-12-01", "/api/flights/quota"])(
    "비로그인 GET %s 는 401 JSON",
    async (path) => {
      const res = await request(createApp()).get(path);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
      expect(holder.searchFlights).not.toHaveBeenCalled();
    }
  );

  it("로그인하면 검색 결과를 돌려준다", async () => {
    const date = futureDate(20);
    const res = await request(loggedInApp()).get(`/api/flights/search?from=icn&to=nrt&date=${date}&adults=2`);

    expect(res.status).toBe(200);
    expect(res.body.lowestPrice).toBe(320000);
    expect(res.body.query).toEqual({ from: "ICN", to: "NRT", date, tripType: "oneway", adults: 2 });
    expect(holder.searchFlights).toHaveBeenCalledWith({ from: "ICN", to: "NRT", date, tripType: "oneway", adults: 2 });
  });

  it("잘못된 조건은 SerpApi 를 부르지 않고 400 INVALID_PARAM", async () => {
    const res = await request(loggedInApp()).get(`/api/flights/search?from=ICN&to=ICN&date=${futureDate(5)}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_PARAM");
    expect(holder.searchFlights).not.toHaveBeenCalled();
  });

  it("남은 검색 횟수를 알려준다", async () => {
    const res = await request(loggedInApp("quota-user")).get("/api/flights/quota");

    expect(res.status).toBe(200);
    expect(res.body.remainingSearches).toBeGreaterThan(0);
  });
});
