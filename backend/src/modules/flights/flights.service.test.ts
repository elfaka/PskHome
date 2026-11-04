import { describe, expect, it, vi } from "vitest";

import { createFlightsService, kstDate, parseSearchQuery, parseToken } from "./flights.service.js";
import type { BookingOption, FlightOption, FlightSearchQuery, ParsedFlightSearch } from "./flights.types.js";
import type { SerpApiClient } from "./serpapi/serpApiClient.js";

// 2026-11-04 10:00 KST
const NOW = new Date("2026-11-04T01:00:00Z");

function option(id: string, price: number | null): FlightOption {
  return {
    id,
    price,
    totalDurationMinutes: 140,
    stops: 0,
    airlines: ["대한항공"],
    departureTime: "2026-12-01 09:00",
    arrivalTime: "2026-12-01 11:20",
    segments: [],
    layovers: [],
    best: false,
    bookingToken: null,
    departureToken: null,
  };
}

const booking: BookingOption = {
  seller: "대한항공",
  isAirline: true,
  logo: null,
  price: 300000,
  fareName: "이코노미",
  conditions: [],
  baggage: [],
  request: { url: "https://www.google.com/travel/clk/f", postData: "u=abc" },
  phone: null,
  separateTickets: false,
  legs: [],
};

function fakeClient(result: ParsedFlightSearch = { options: [option("a", 300000), option("b", 210000), option("c", null)], priceInsights: null, googleFlightsUrl: null }) {
  const searchFlights = vi.fn<SerpApiClient["searchFlights"]>(async () => result);
  const getReturnFlights = vi.fn<SerpApiClient["getReturnFlights"]>(async () => result);
  const getBookingOptions = vi.fn<SerpApiClient["getBookingOptions"]>(async () => ({
    options: [booking],
    googleFlightsUrl: null,
  }));
  return {
    client: { searchFlights, getReturnFlights, getBookingOptions } satisfies SerpApiClient,
    searchFlights,
    getReturnFlights,
    getBookingOptions,
  };
}

const valid = { from: "icn", to: "NRT", date: "2026-12-01" };

describe("parseSearchQuery", () => {
  it("공항 코드를 대문자로 바꾸고 기본값(편도, 성인 1명)을 채운다", () => {
    expect(parseSearchQuery(valid, NOW)).toEqual({ from: "ICN", to: "NRT", date: "2026-12-01", tripType: "oneway", adults: 1 });
  });

  it("오늘(KST) 출발은 허용하고 어제는 거부한다", () => {
    // UTC 로는 11-03 이지만 KST 로는 11-04
    const lateNight = new Date("2026-11-03T16:00:00Z");
    expect(kstDate(lateNight)).toBe("2026-11-04");
    expect(parseSearchQuery({ ...valid, date: "2026-11-04" }, lateNight).date).toBe("2026-11-04");
    expect(() => parseSearchQuery({ ...valid, date: "2026-11-03" }, lateNight)).toThrowError(/오늘 이후/);
  });

  it("330일을 넘는 출발일은 거부한다", () => {
    expect(parseSearchQuery({ ...valid, date: "2027-09-30" }, NOW).date).toBe("2027-09-30");
    expect(() => parseSearchQuery({ ...valid, date: "2027-10-01" }, NOW)).toThrowError(/330일/);
  });

  it.each([
    [{ ...valid, from: "IC" }, /영문 3자리/],
    [{ ...valid, from: "123" }, /영문 3자리/],
    [{ ...valid, to: "ICN" }, /같습니다/],
    [{ ...valid, date: "2026/12/01" }, /YYYY-MM-DD/],
    [{ ...valid, date: "2026-02-30" }, /YYYY-MM-DD/],
    [{ ...valid, adults: "0" }, /1명 이상/],
    [{ ...valid, adults: "10" }, /9명 이하/],
    [{ ...valid, tripType: "multi" }, /oneway 또는 round/],
    [{ ...valid, tripType: "round" }, /귀국일이 필요/],
    [{ ...valid, tripType: "round", returnDate: "2026-11-30" }, /출발일 이후/],
    [{ ...valid, returnDate: "2026-12-05" }, /편도 검색에는/],
    [{ to: "NRT", date: "2026-12-01" }, /공항 코드를 입력/],
  ])("규칙 위반 %o → 400 INVALID_PARAM", (raw, message) => {
    expect(() => parseSearchQuery(raw, NOW)).toThrowError(
      expect.objectContaining({ status: 400, code: "INVALID_PARAM", message: expect.stringMatching(message) })
    );
  });

  it("왕복은 같은 날 귀국도 허용하고, 빈 귀국일은 없는 값으로 본다", () => {
    expect(parseSearchQuery({ ...valid, tripType: "round", returnDate: "2026-12-01", adults: "2" }, NOW)).toEqual({
      from: "ICN",
      to: "NRT",
      date: "2026-12-01",
      returnDate: "2026-12-01",
      tripType: "round",
      adults: 2,
    });
    expect(parseSearchQuery({ ...valid, returnDate: "" }, NOW).returnDate).toBeUndefined();
  });
});

describe("createFlightsService.search", () => {
  const query: FlightSearchQuery = { from: "ICN", to: "NRT", date: "2026-12-01", tripType: "oneway", adults: 1 };

  it("결과 중 최저가와 남은 횟수를 돌려준다", async () => {
    const { client } = fakeClient();
    const service = createFlightsService({ getClient: () => client, dailyLimit: 5, now: () => NOW });

    const result = await service.search("u1", query);

    expect(result.lowestPrice).toBe(210000);
    expect(result.currency).toBe("KRW");
    expect(result.remainingSearches).toBe(4);
    expect(result.cached).toBe(false);
    expect(result.fetchedAt).toBe(NOW.toISOString());
  });

  it("결과가 없으면 lowestPrice 는 null", async () => {
    const { client } = fakeClient({ options: [], priceInsights: null, googleFlightsUrl: null });
    const service = createFlightsService({ getClient: () => client, dailyLimit: 5, now: () => NOW });

    expect((await service.search("u1", query)).lowestPrice).toBeNull();
  });

  it("같은 조건은 캐시에서 꺼내고, 이때는 한도를 쓰지 않는다 (다른 사용자도 마찬가지)", async () => {
    const { client, searchFlights } = fakeClient();
    const service = createFlightsService({ getClient: () => client, dailyLimit: 5, now: () => NOW });

    await service.search("u1", query);
    const again = await service.search("u1", query);
    const other = await service.search("u2", query);

    expect(searchFlights).toHaveBeenCalledTimes(1);
    expect(again.cached).toBe(true);
    expect(again.remainingSearches).toBe(4);
    expect(other.remainingSearches).toBe(5);
  });

  it("하루 한도를 넘으면 429 DAILY_LIMIT_EXCEEDED, 다음 날(KST)에는 다시 된다", async () => {
    const { client } = fakeClient();
    let now = NOW;
    const service = createFlightsService({ getClient: () => client, dailyLimit: 2, now: () => now });

    await service.search("u1", { ...query, date: "2026-12-01" });
    await service.search("u1", { ...query, date: "2026-12-02" });
    await expect(service.search("u1", { ...query, date: "2026-12-03" })).rejects.toMatchObject({
      status: 429,
      code: "DAILY_LIMIT_EXCEEDED",
    });
    expect(service.remaining("u1")).toBe(0);

    now = new Date("2026-11-04T15:00:00Z"); // 11-05 00:00 KST
    await expect(service.search("u1", { ...query, date: "2026-12-04" })).resolves.toMatchObject({ remainingSearches: 1 });
  });

  it("SerpApi 호출이 실패하면 쓴 횟수를 돌려준다", async () => {
    const searchFlights = vi.fn<SerpApiClient["searchFlights"]>(async () => {
      throw Object.assign(new Error("boom"), { status: 503 });
    });
    const service = createFlightsService({
      getClient: () => ({ ...fakeClient().client, searchFlights }),
      dailyLimit: 3,
      now: () => NOW,
    });

    await expect(service.search("u1", query)).rejects.toThrow("boom");
    expect(service.remaining("u1")).toBe(3);
  });

  it("키가 없으면 503 SERPAPI_DISABLED 이고 한도를 쓰지 않는다", async () => {
    const service = createFlightsService({ getClient: () => null, dailyLimit: 3, now: () => NOW });

    await expect(service.search("u1", query)).rejects.toMatchObject({ status: 503, code: "SERPAPI_DISABLED" });
    expect(service.remaining("u1")).toBe(3);
  });
});

describe("오는 편·판매처 조회", () => {
  const oneway: FlightSearchQuery = { from: "ICN", to: "NRT", date: "2026-12-01", tripType: "oneway", adults: 1 };
  const round: FlightSearchQuery = { ...oneway, tripType: "round", returnDate: "2026-12-05" };

  it("판매처 조회도 한도를 1회 쓰고, 같은 토큰은 캐시에서 꺼낸다", async () => {
    const fake = fakeClient();
    const service = createFlightsService({ getClient: () => fake.client, dailyLimit: 5, now: () => NOW });

    const first = await service.bookingOptions("u1", oneway, "bk-1");
    const again = await service.bookingOptions("u1", oneway, "bk-1");

    expect(first.options[0].seller).toBe("대한항공");
    expect(first.remainingSearches).toBe(4);
    expect(again.cached).toBe(true);
    expect(again.remainingSearches).toBe(4);
    expect(fake.getBookingOptions).toHaveBeenCalledTimes(1);
    expect(fake.getBookingOptions).toHaveBeenCalledWith(oneway, "bk-1");
  });

  it("왕복은 가는 편 토큰으로 오는 편 목록을 받는다", async () => {
    const fake = fakeClient();
    const service = createFlightsService({ getClient: () => fake.client, dailyLimit: 5, now: () => NOW });

    const result = await service.returnFlights("u1", round, "dep-1");

    expect(result.options).toHaveLength(3);
    expect(result.remainingSearches).toBe(4);
    expect(fake.getReturnFlights).toHaveBeenCalledWith(round, "dep-1");
  });

  it("편도에서 오는 편을 찾으면 400 이고 한도를 쓰지 않는다", async () => {
    const fake = fakeClient();
    const service = createFlightsService({ getClient: () => fake.client, dailyLimit: 5, now: () => NOW });

    await expect(service.returnFlights("u1", oneway, "dep-1")).rejects.toMatchObject({ status: 400 });
    expect(service.remaining("u1")).toBe(5);
    expect(fake.getReturnFlights).not.toHaveBeenCalled();
  });

  it("토큰은 base64 계열 문자만 받는다", () => {
    expect(parseToken("WyJDalJJ_-+/=abc", "bookingToken")).toBe("WyJDalJJ_-+/=abc");
    expect(() => parseToken(undefined, "bookingToken")).toThrowError(/필요합니다/);
    expect(() => parseToken("a b", "bookingToken")).toThrowError(/형식/);
    expect(() => parseToken("x".repeat(4097), "bookingToken")).toThrowError(/형식/);
    expect(() => parseToken(["a"], "bookingToken")).toThrowError(/필요합니다/);
  });
});
