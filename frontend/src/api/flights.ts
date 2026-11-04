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

export async function searchFlights(params: FlightSearchParams): Promise<FlightSearchResult> {
  const { returnDate, ...rest } = params;
  const res = await api.get<FlightSearchResult>("/api/flights/search", {
    params: params.tripType === "round" ? { ...rest, returnDate } : rest,
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
