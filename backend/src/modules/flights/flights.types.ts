/** 항공권 최저가 검색 — 요청/응답 타입 */

export type TripType = "oneway" | "round";

export interface FlightSearchQuery {
  /** 출발 공항 IATA 코드 (대문자 3자리) */
  from: string;
  /** 도착 공항 IATA 코드 */
  to: string;
  /** 출발일 YYYY-MM-DD */
  date: string;
  /** 귀국일 YYYY-MM-DD (왕복만) */
  returnDate?: string;
  tripType: TripType;
  /** 성인 인원 1~9 */
  adults: number;
}

export interface AirportRef {
  id: string;
  name: string;
}

/** 실제로 타는 비행 한 구간 */
export interface FlightSegment {
  airline: string;
  airlineLogo: string | null;
  flightNumber: string;
  departureAirport: AirportRef;
  /** 현지 시각 "YYYY-MM-DD HH:MM" (SerpApi 가 주는 그대로) */
  departureTime: string;
  arrivalAirport: AirportRef;
  arrivalTime: string;
  durationMinutes: number | null;
  airplane: string | null;
  travelClass: string | null;
}

export interface Layover {
  id: string;
  name: string;
  durationMinutes: number | null;
  overnight: boolean;
}

/** 검색 결과 한 건 (가는 편 여정) */
export interface FlightOption {
  /** 구간 편명·출발 시각으로 만든 식별자 (같은 여정 중복 제거에 쓴다) */
  id: string;
  /** 원화. 왕복이면 왕복 총액. 가격이 없으면 null */
  price: number | null;
  totalDurationMinutes: number | null;
  /** 경유 횟수 (직항 0) */
  stops: number;
  airlines: string[];
  departureTime: string;
  arrivalTime: string;
  segments: FlightSegment[];
  layovers: Layover[];
  /** Google 이 "추천 항공편"으로 고른 항목인지 */
  best: boolean;
}

export interface PriceInsights {
  lowestPrice: number | null;
  /** "low" | "typical" | "high" 등 Google 이 주는 값 */
  priceLevel: string | null;
  typicalRange: [number, number] | null;
}

/** SerpApi 응답을 정리한 결과 (사용자와 무관한 부분 — 캐시 대상) */
export interface ParsedFlightSearch {
  options: FlightOption[];
  priceInsights: PriceInsights | null;
  googleFlightsUrl: string | null;
}

export interface FlightSearchResult extends ParsedFlightSearch {
  query: FlightSearchQuery;
  currency: "KRW";
  lowestPrice: number | null;
  /** 이 결과를 SerpApi 에서 받은 시각 (ISO). 캐시 적중이면 과거 시각이다 */
  fetchedAt: string;
  /** 오늘(KST) 남은 검색 횟수 */
  remainingSearches: number;
  /** 30분 캐시에서 꺼낸 결과인지 */
  cached: boolean;
}
