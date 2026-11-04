import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "@/test/mocks/server";

import { FLIGHTS_LOGIN_URL, getBookingOptions, getFlightQuota, getReturnFlights, searchFlights } from "./flights";

describe("flights API functions", () => {
  it("편도 검색은 귀국일을 보내지 않는다", async () => {
    let seen: URLSearchParams | null = null;
    server.use(
      http.get("/api/flights/search", ({ request }) => {
        seen = new URL(request.url).searchParams;
        return HttpResponse.json({ options: [] });
      })
    );

    await searchFlights({ from: "ICN", to: "NRT", date: "2026-12-01", returnDate: "2026-12-05", tripType: "oneway", adults: 2 });

    expect(seen!.get("from")).toBe("ICN");
    expect(seen!.get("adults")).toBe("2");
    expect(seen!.get("tripType")).toBe("oneway");
    expect(seen!.has("returnDate")).toBe(false);
  });

  it("왕복 검색은 귀국일을 함께 보낸다", async () => {
    let seen: URLSearchParams | null = null;
    server.use(
      http.get("/api/flights/search", ({ request }) => {
        seen = new URL(request.url).searchParams;
        return HttpResponse.json({ options: [] });
      })
    );

    await searchFlights({ from: "ICN", to: "NRT", date: "2026-12-01", returnDate: "2026-12-05", tripType: "round", adults: 1 });

    expect(seen!.get("returnDate")).toBe("2026-12-05");
  });

  it("남은 검색 횟수를 가져온다", async () => {
    await expect(getFlightQuota()).resolves.toEqual({ remainingSearches: 30 });
  });

  it("로그인 주소는 /flights 로 돌아오도록 returnTo 를 붙인다", () => {
    const url = new URL(FLIGHTS_LOGIN_URL, "http://localhost");
    expect(url.pathname).toBe("/api/oauth2/authorization/google");
    expect(url.searchParams.get("returnTo")).toBe("/flights");
  });

  it("판매처·오는 편 조회는 검색 조건에 토큰을 붙여 보낸다", async () => {
    const seen: Record<string, URLSearchParams> = {};
    server.use(
      http.get("/api/flights/booking", ({ request }) => {
        seen.booking = new URL(request.url).searchParams;
        return HttpResponse.json({ options: [] });
      }),
      http.get("/api/flights/returns", ({ request }) => {
        seen.returns = new URL(request.url).searchParams;
        return HttpResponse.json({ options: [] });
      })
    );
    const round = { from: "ICN", to: "NRT", date: "2026-12-01", returnDate: "2026-12-05", tripType: "round" as const, adults: 1 };

    await getBookingOptions({ ...round, tripType: "oneway" }, "bk+/=");
    await getReturnFlights(round, "dep-1");

    expect(seen.booking.get("bookingToken")).toBe("bk+/=");
    expect(seen.booking.has("returnDate")).toBe(false);
    expect(seen.returns.get("departureToken")).toBe("dep-1");
    expect(seen.returns.get("returnDate")).toBe("2026-12-05");
  });
});
