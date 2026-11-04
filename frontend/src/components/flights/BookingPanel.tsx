"use client";

import { useEffect, useState } from "react";

import {
  getBookingOptions,
  getReturnFlights,
  type BookingOption,
  type BookingOptionsResult,
  type FlightOption,
  type FlightSearchParams,
} from "@/api/flights";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { errorMessage } from "@/lib/errorMessage";

import { openBooking } from "./booking";
import { clockOf, dayOffset, formatDuration, formatPrice } from "./format";

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "done"; data: T };

/** 열릴 때 한 번 불러온다. 같은 조건은 백엔드가 30분 캐시하므로 다시 열어도 한도를 쓰지 않는다 */
function useLoad<T extends { remainingSearches: number }>(load: () => Promise<T>, onRemaining: (n: number) => void) {
  const [state, setState] = useState<Load<T>>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    load()
      .then((data) => {
        if (!alive) return;
        setState({ status: "done", data });
        onRemaining(data.remainingSearches);
      })
      .catch((err) => alive && setState({ status: "error", message: errorMessage(err, "불러오지 못했습니다.") }));
    return () => {
      alive = false;
    };
    // 패널은 열릴 때마다 새로 마운트된다. load 는 그 시점의 조건으로 고정한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

function SellerRow({ option, searchedPrice }: { option: BookingOption; searchedPrice: number | null }) {
  const samePrice = option.price != null && option.price === searchedPrice;
  const notes = [...option.conditions, ...option.baggage];

  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-fg">{option.seller}</span>
          {option.isAirline && <Badge tone="success">항공사 공식</Badge>}
          {samePrice && <Badge tone="accent">검색 가격</Badge>}
          {option.separateTickets && <Badge tone="warning">가는 편·오는 편 따로 구매</Badge>}
        </div>
        {(option.fareName || notes.length > 0) && (
          <p className="mt-1 text-xs text-fg-subtle">{[option.fareName, ...notes].filter(Boolean).join(" · ")}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 sm:justify-end">
        <span className="text-base font-bold text-fg tabular-nums">{formatPrice(option.price)}</span>

        {option.separateTickets ? (
          <div className="flex flex-wrap gap-2">
            {option.legs.map((leg) => (
              <Button
                key={leg.label}
                size="sm"
                variant="primary"
                disabled={!leg.request}
                onClick={() => leg.request && openBooking(leg.request)}
              >
                {leg.label} {leg.seller} ↗
              </Button>
            ))}
          </div>
        ) : option.request ? (
          <Button size="sm" variant="primary" onClick={() => openBooking(option.request!)}>
            사이트로 이동 ↗
          </Button>
        ) : option.phone ? (
          <span className="text-sm text-fg-muted">전화 예약 {option.phone}</span>
        ) : (
          <span className="text-sm text-fg-subtle">온라인 예약 불가</span>
        )}
      </div>
    </li>
  );
}

/** 고른 여정을 파는 곳 목록 */
export function BookingSellers({
  query,
  bookingToken,
  searchedPrice,
  onRemaining,
}: {
  query: FlightSearchParams;
  bookingToken: string;
  searchedPrice: number | null;
  onRemaining: (n: number) => void;
}) {
  const state = useLoad<BookingOptionsResult>(() => getBookingOptions(query, bookingToken), onRemaining);

  if (state.status === "loading") return <Skeleton className="h-24 w-full" />;
  if (state.status === "error") return <Alert title="판매처를 불러오지 못했습니다">{state.message}</Alert>;

  const { options, googleFlightsUrl } = state.data;

  return (
    <div aria-label="판매처" role="region">
      {options.length === 0 ? (
        <p className="text-sm text-fg-muted">이 항공편을 파는 곳을 찾지 못했습니다.</p>
      ) : (
        <ul className="divide-y divide-line">
          {options.map((option, i) => (
            <SellerRow key={`${option.seller}-${i}`} option={option} searchedPrice={searchedPrice} />
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-fg-subtle">
        가격 낮은 순입니다. 버튼을 누르면 새 탭에서 판매처 예약 페이지가 열립니다(Google 항공편 경유). 최종 가격은 판매처에서
        확인하세요.
        {googleFlightsUrl && (
          <>
            {" "}
            <a
              href={googleFlightsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent-soft-fg underline underline-offset-2"
            >
              Google 항공편에서 보기 ↗
            </a>
          </>
        )}
      </p>
    </div>
  );
}

/** 왕복: 오는 편을 고르면 그 조합의 판매처를 보여준다 */
export function ReturnPicker({
  query,
  departureToken,
  onRemaining,
}: {
  query: FlightSearchParams;
  departureToken: string;
  onRemaining: (n: number) => void;
}) {
  const state = useLoad(() => getReturnFlights(query, departureToken), onRemaining);
  const [picked, setPicked] = useState<FlightOption | null>(null);

  if (state.status === "loading") return <Skeleton className="h-24 w-full" />;
  if (state.status === "error") return <Alert title="오는 편을 불러오지 못했습니다">{state.message}</Alert>;

  if (picked?.bookingToken) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-fg-muted">
            오는 편 <strong className="text-fg">{picked.airlines.join(" · ")}</strong> {clockOf(picked.departureTime)} →{" "}
            {clockOf(picked.arrivalTime)} · 왕복 {formatPrice(picked.price)}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
            오는 편 다시 고르기
          </Button>
        </div>
        <BookingSellers
          query={query}
          bookingToken={picked.bookingToken}
          searchedPrice={picked.price}
          onRemaining={onRemaining}
        />
      </div>
    );
  }

  const options = state.data.options;
  if (options.length === 0) return <p className="text-sm text-fg-muted">오는 편을 찾지 못했습니다.</p>;

  return (
    <div role="region" aria-label="오는 편">
      <p className="mb-2 text-xs text-fg-subtle">오는 편을 고르세요. 가격은 왕복 총액이고, 고르면 판매처를 불러옵니다(검색 1회).</p>
      <ul className="divide-y divide-line">
        {options.map((o) => {
          const plusDays = dayOffset(o.departureTime, o.arrivalTime);
          return (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 text-sm">
                <span className="font-semibold text-fg">{o.airlines.join(" · ")}</span>
                <span className="ml-2 text-fg-muted tabular-nums">
                  {clockOf(o.departureTime)} → {clockOf(o.arrivalTime)}
                  {plusDays > 0 && ` (+${plusDays})`} · {formatDuration(o.totalDurationMinutes)} ·{" "}
                  {o.stops === 0 ? "직항" : `경유 ${o.stops}회`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-fg tabular-nums">{formatPrice(o.price)}</span>
                <Button size="sm" disabled={!o.bookingToken} onClick={() => setPicked(o)}>
                  이 편 선택
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
