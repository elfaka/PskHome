import { api } from "./client";

/** 항공권 최저가 검색 API (`/api/flights/**`, 로그인 필요) */

export type TripType = "oneway" | "round";

export type FlightSearchParams = {
  from: string;
  to: string;
  /** YYYY-MM-DD */
  date: string;
  /** 왕복만 */
  returnDate?: string;
  tripType: TripType;
  adults: number;
};

export type AirportRef = { id: string; name: string };

export type FlightSegment = {
  airline: string;
  airlineLogo: string | null;
  flightNumber: string;
  departureAirport: AirportRef;
  /** 현지 시각 "YYYY-MM-DD HH:MM" */
  departureTime: string;
  arrivalAirport: AirportRef;
  arrivalTime: string;
  durationMinutes: number | null;
  airplane: string | null;
  travelClass: string | null;
};

export type Layover = {
  id: string;
  name: string;
  durationMinutes: number | null;
  overnight: boolean;
};

export type FlightOption = {
  id: string;
  /** 원화. 왕복이면 왕복 총액 */
  price: number | null;
  totalDurationMinutes: number | null;
  stops: number;
  airlines: string[];
  departureTime: string;
  arrivalTime: string;
  segments: FlightSegment[];
  layovers: Layover[];
  best: boolean;
  /** 판매처 조회용 (편도 결과, 왕복의 오는 편 결과) */
  bookingToken: string | null;
  /** 왕복 가는 편 결과에만 있다. 오는 편 목록 조회용 */
  departureToken: string | null;
};

/** `postData` 가 있으면 `url` 로 POST, 없으면 `url` 로 바로 이동 */
export type BookingRequest = { url: string; postData: string | null };

export type BookingLeg = {
  label: "가는 편" | "오는 편";
  seller: string;
  price: number | null;
  request: BookingRequest | null;
};

export type BookingOption = {
  seller: string;
  isAirline: boolean;
  logo: string | null;
  price: number | null;
  fareName: string | null;
  conditions: string[];
  baggage: string[];
  request: BookingRequest | null;
  phone: string | null;
  separateTickets: boolean;
  legs: BookingLeg[];
};

export type BookingOptionsResult = {
  /** 가격 오름차순 */
  options: BookingOption[];
  googleFlightsUrl: string | null;
  remainingSearches: number;
  cached: boolean;
};

export type ReturnFlightsResult = {
  options: FlightOption[];
  remainingSearches: number;
  cached: boolean;
};

export type PriceInsights = {
  lowestPrice: number | null;
  priceLevel: string | null;
  typicalRange: [number, number] | null;
};

export type FlightSearchResult = {
  query: FlightSearchParams;
  currency: "KRW";
  lowestPrice: number | null;
  /** 가격 오름차순 */
  options: FlightOption[];
  priceInsights: PriceInsights | null;
  googleFlightsUrl: string | null;
  fetchedAt: string;
  remainingSearches: number;
  cached: boolean;
};

/** 검색 조건 → 쿼리 (편도에는 귀국일을 넣지 않는다 — 백엔드가 400 으로 거절한다) */
function queryParams(params: FlightSearchParams) {
  const { returnDate, ...rest } = params;
  return params.tripType === "round" ? { ...rest, returnDate } : rest;
}

export async function searchFlights(params: FlightSearchParams): Promise<FlightSearchResult> {
  const res = await api.get<FlightSearchResult>("/api/flights/search", { params: queryParams(params) });
  return res.data;
}

/** 왕복: 고른 가는 편의 오는 편 목록 (검색 1회 사용) */
export async function getReturnFlights(params: FlightSearchParams, departureToken: string): Promise<ReturnFlightsResult> {
  const res = await api.get<ReturnFlightsResult>("/api/flights/returns", {
    params: { ...queryParams(params), departureToken },
  });
  return res.data;
}

/** 고른 여정을 그 가격에 파는 곳 (검색 1회 사용) */
export async function getBookingOptions(params: FlightSearchParams, bookingToken: string): Promise<BookingOptionsResult> {
  const res = await api.get<BookingOptionsResult>("/api/flights/booking", {
    params: { ...queryParams(params), bookingToken },
  });
  return res.data;
}

export async function getFlightQuota(): Promise<{ remainingSearches: number }> {
  const res = await api.get<{ remainingSearches: number }>("/api/flights/quota");
  return res.data;
}

/** 로그인 상태 (`/api/auth/me` 는 비로그인이어도 200) */
export async function getMe(): Promise<{ authenticated: boolean; name?: string }> {
  const res = await api.get<{ authenticated: boolean; name?: string }>("/api/auth/me");
  return res.data;
}

/** 로그인 후 이 화면으로 돌아오는 Google 로그인 시작 주소 */
export const FLIGHTS_LOGIN_URL = "/api/oauth2/authorization/google?returnTo=%2Fflights";
