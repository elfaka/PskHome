import { describe, expect, it, vi } from "vitest";

import type { FlightSearchQuery } from "../flights.types.js";
import { buildSearchParams, createSerpApiClient, parseBookingResponse, parseSearchResponse } from "./serpApiClient.js";

function segment(flightNumber: string, from: string, to: string, dep: string, arr: string, duration = 120) {
  return {
    departure_airport: { name: `${from} 공항`, id: from, time: dep },
    arrival_airport: { name: `${to} 공항`, id: to, time: arr },
    duration,
    airplane: "Airbus A321",
    airline: flightNumber.startsWith("KE") ? "대한항공" : "제주항공",
    airline_logo: "https://example.com/logo.png",
    travel_class: "이코노미",
    flight_number: flightNumber,
  };
}

const sample = {
  search_metadata: { status: "Success", google_flights_url: "https://www.google.com/travel/flights?q=x" },
  best_flights: [
    {
      flights: [segment("KE 703", "ICN", "NRT", "2026-12-01 09:00", "2026-12-01 11:20", 140)],
      layovers: [],
      total_duration: 140,
      price: 320000,
      type: "편도",
    },
  ],
  other_flights: [
    {
      flights: [
        segment("7C 1101", "ICN", "PUS", "2026-12-01 06:00", "2026-12-01 07:00", 60),
        segment("7C 1151", "PUS", "NRT", "2026-12-01 09:00", "2026-12-01 11:00", 120),
      ],
      layovers: [{ duration: 120, name: "김해국제공항", id: "PUS" }],
      total_duration: 300,
      price: 180000,
    },
    // best 와 같은 여정이 더 비싸게 한 번 더 나온 경우
    {
      flights: [segment("KE 703", "ICN", "NRT", "2026-12-01 09:00", "2026-12-01 11:20", 140)],
      total_duration: 140,
      price: 350000,
    },
    { flights: [segment("KE 705", "ICN", "NRT", "2026-12-01 13:00", "2026-12-01 15:20")], total_duration: 140 },
    { flights: [] },
  ],
  price_insights: { lowest_price: 180000, price_level: "low", typical_price_range: [200000, 400000] },
};

const oneway: FlightSearchQuery = { from: "ICN", to: "NRT", date: "2026-12-01", tripType: "oneway", adults: 1 };

describe("parseSearchResponse", () => {
  it("best·other 를 합쳐 가격순으로 정렬하고, 가격 없는 항목은 맨 뒤에 둔다", () => {
    const parsed = parseSearchResponse(sample);

    expect(parsed.options.map((o) => o.price)).toEqual([180000, 320000, null]);
    expect(parsed.googleFlightsUrl).toBe("https://www.google.com/travel/flights?q=x");
    expect(parsed.priceInsights).toEqual({ lowestPrice: 180000, priceLevel: "low", typicalRange: [200000, 400000] });
  });

  it("같은 여정은 하나만 남기고 싼 가격과 best 표시를 유지한다", () => {
    const parsed = parseSearchResponse(sample);
    const ke703 = parsed.options.filter((o) => o.segments[0].flightNumber === "KE 703");

    expect(ke703).toHaveLength(1);
    expect(ke703[0].price).toBe(320000);
    expect(ke703[0].best).toBe(true);
  });

  it("경유 횟수·전체 출발/도착 시각·항공사를 구간에서 계산한다", () => {
    const transfer = parseSearchResponse(sample).options[0];

    expect(transfer.stops).toBe(1);
    expect(transfer.departureTime).toBe("2026-12-01 06:00");
    expect(transfer.arrivalTime).toBe("2026-12-01 11:00");
    expect(transfer.airlines).toEqual(["제주항공"]);
    expect(transfer.layovers).toEqual([{ id: "PUS", name: "김해국제공항", durationMinutes: 120, overnight: false }]);
  });

  it("결과 없음 오류는 빈 결과로 돌려준다", () => {
    const parsed = parseSearchResponse({ error: "Google Flights hasn't returned any results for this query." });

    expect(parsed.options).toEqual([]);
    expect(parsed.priceInsights).toBeNull();
  });

  it("그 밖의 오류는 503 SERPAPI_ERROR", () => {
    expect(() => parseSearchResponse({ error: "Invalid API key." })).toThrowError(
      expect.objectContaining({ status: 503, code: "SERPAPI_ERROR" })
    );
  });
});

describe("buildSearchParams", () => {
  it("편도는 type=2, 귀국일 없이 원화·한국어로 요청한다", () => {
    const p = buildSearchParams(oneway);

    expect(p.get("engine")).toBe("google_flights");
    expect(p.get("type")).toBe("2");
    expect(p.get("return_date")).toBeNull();
    expect(p.get("currency")).toBe("KRW");
    expect(p.get("hl")).toBe("ko");
    expect(p.get("api_key")).toBeNull();
  });

  it("왕복은 type=1 + return_date", () => {
    const p = buildSearchParams({ ...oneway, tripType: "round", returnDate: "2026-12-05", adults: 2 });

    expect(p.get("type")).toBe("1");
    expect(p.get("return_date")).toBe("2026-12-05");
    expect(p.get("adults")).toBe("2");
  });
});

describe("createSerpApiClient", () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("api_key 를 붙여 search.json 을 부르고 결과를 정리한다", async () => {
    const fetchMock = vi.fn(async () => json(200, sample));
    const client = createSerpApiClient({ apiKey: "k-123", baseUrl: "https://serp.test/", fetch: fetchMock });

    const parsed = await client.searchFlights(oneway);

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://serp.test/search.json");
    expect(url.searchParams.get("api_key")).toBe("k-123");
    expect(url.searchParams.get("departure_id")).toBe("ICN");
    expect(parsed.options).toHaveLength(3);
  });

  it("한도 소진(429) 등 오류 상태는 SerpApi 메시지를 담아 503 으로 바꾼다", async () => {
    const client = createSerpApiClient({
      apiKey: "k",
      baseUrl: "https://serp.test",
      fetch: async () => json(429, { error: "Your account has run out of searches." }),
    });

    await expect(client.searchFlights(oneway)).rejects.toMatchObject({
      status: 503,
      code: "SERPAPI_ERROR",
      message: expect.stringContaining("run out of searches"),
    });
  });

  it("오류 상태라도 결과 없음이면 빈 결과", async () => {
    const client = createSerpApiClient({
      apiKey: "k",
      baseUrl: "https://serp.test",
      fetch: async () => json(400, { error: "Google Flights hasn't returned any results for this query." }),
    });

    await expect(client.searchFlights(oneway)).resolves.toMatchObject({ options: [] });
  });

  it("연결 실패는 503 SERPAPI_UNREACHABLE 이고 메시지에 키가 남지 않는다", async () => {
    const client = createSerpApiClient({
      apiKey: "secret-key",
      baseUrl: "https://serp.test",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });

    const err = await client.searchFlights(oneway).catch((e: unknown) => e as Error & { code: string });
    expect(err.code).toBe("SERPAPI_UNREACHABLE");
    expect(err.message).not.toContain("secret-key");
  });
});

describe("판매처 (booking options)", () => {
  const bookingBody = {
    search_metadata: { google_flights_url: "https://www.google.com/travel/flights?b=1" },
    booking_options: [
      {
        together: {
          book_with: "트립닷컴",
          airline_logos: ["https://example.com/ke.png"],
          marketed_as: ["KE 703"],
          price: 298000,
          option_title: "이코노미",
          extensions: ["환불 불가"],
          baggage_prices: ["위탁 수하물 1개 포함"],
          booking_request: { url: "https://www.google.com/travel/clk/f", post_data: "u=AAA_bbb-ccc" },
        },
      },
      {
        together: {
          book_with: "대한항공",
          airline: true,
          price: 320000,
          booking_request: { url: "https://www.google.com/travel/clk/f", post_data: "u=DDD" },
        },
      },
      // 같은 가격이면 항공사 직판을 먼저
      { together: { book_with: "마이리얼트립", price: 320000, booking_request: { url: "https://www.google.com/travel/clk/f", post_data: "u=EEE" } } },
      // 전화 예약만 되는 곳
      { together: { book_with: "전화여행사", price: 250000, booking_phone: "02-000-0000" } },
      // 가는 편·오는 편을 따로 사는 경우
      {
        separate_tickets: true,
        departing: { book_with: "제주항공", price: 100000, booking_request: { url: "https://www.google.com/travel/clk/f", post_data: "u=DEP" } },
        returning: { book_with: "티웨이항공", price: 120000, booking_request: { url: "https://www.google.com/travel/clk/f", post_data: "u=RET" } },
      },
      // https 가 아닌 주소는 이동 정보에서 뺀다
      { together: { book_with: "이상한곳", price: 400000, booking_request: { url: "javascript:alert(1)" } } },
      { together: {} },
    ],
  };

  it("판매처를 가격순으로 정리하고, 같은 가격이면 항공사 직판이 먼저다", () => {
    const { options, googleFlightsUrl } = parseBookingResponse(bookingBody);

    expect(options.map((o) => o.seller)).toEqual(["제주항공", "전화여행사", "트립닷컴", "대한항공", "마이리얼트립", "이상한곳"]);
    expect(googleFlightsUrl).toBe("https://www.google.com/travel/flights?b=1");
  });

  it("이동 요청(url + post_data)과 운임 정보를 그대로 넘긴다", () => {
    const trip = parseBookingResponse(bookingBody).options.find((o) => o.seller === "트립닷컴")!;

    expect(trip).toMatchObject({
      isAirline: false,
      logo: "https://example.com/ke.png",
      price: 298000,
      fareName: "이코노미",
      conditions: ["환불 불가"],
      baggage: ["위탁 수하물 1개 포함"],
      request: { url: "https://www.google.com/travel/clk/f", postData: "u=AAA_bbb-ccc" },
      separateTickets: false,
    });
  });

  it("따로 사는 표는 구간별 이동 정보와 합계 가격을 준다", () => {
    const split = parseBookingResponse(bookingBody).options[0];

    expect(split.separateTickets).toBe(true);
    expect(split.price).toBe(220000);
    expect(split.request).toBeNull();
    expect(split.legs).toEqual([
      { label: "가는 편", seller: "제주항공", price: 100000, request: { url: "https://www.google.com/travel/clk/f", postData: "u=DEP" } },
      { label: "오는 편", seller: "티웨이항공", price: 120000, request: { url: "https://www.google.com/travel/clk/f", postData: "u=RET" } },
    ]);
  });

  it("전화 예약만 되는 곳은 이동 정보 없이 전화번호를 준다", () => {
    const phoneOnly = parseBookingResponse(bookingBody).options.find((o) => o.seller === "전화여행사")!;
    expect(phoneOnly.request).toBeNull();
    expect(phoneOnly.phone).toBe("02-000-0000");
  });

  it("https 가 아닌 이동 주소는 버린다", () => {
    const weird = parseBookingResponse(bookingBody).options.find((o) => o.seller === "이상한곳")!;
    expect(weird.request).toBeNull();
  });

  it("검색 결과 항목의 토큰을 함께 꺼낸다", () => {
    const parsed = parseSearchResponse({
      best_flights: [{ ...sample.best_flights[0], booking_token: "bk-1", departure_token: "dep-1" }],
    });
    expect(parsed.options[0]).toMatchObject({ bookingToken: "bk-1", departureToken: "dep-1" });
  });

  it("판매처 조회는 처음 검색 조건에 booking_token 을 더해 보낸다", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(bookingBody), { status: 200 }));
    const client = createSerpApiClient({ apiKey: "k", baseUrl: "https://serp.test", fetch: fetchMock });

    const result = await client.getBookingOptions(oneway, "bk+/=1");

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("booking_token")).toBe("bk+/=1");
    expect(url.searchParams.get("departure_id")).toBe("ICN");
    expect(url.searchParams.get("currency")).toBe("KRW");
    expect(result.options.length).toBeGreaterThan(0);
  });

  it("오는 편 조회는 departure_token 을 더해 보낸다", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(sample), { status: 200 }));
    const client = createSerpApiClient({ apiKey: "k", baseUrl: "https://serp.test", fetch: fetchMock });

    await client.getReturnFlights({ ...oneway, tripType: "round", returnDate: "2026-12-05" }, "dep-1");

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("departure_token")).toBe("dep-1");
    expect(url.searchParams.get("type")).toBe("1");
  });
});
