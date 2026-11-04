"use client";

import { useMemo, useState } from "react";

import type { FlightOption, FlightSearchResult } from "@/api/flights";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { cardClass } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

import {
  clockOf,
  dayOffset,
  formatDateLabel,
  formatDuration,
  formatPrice,
  priceLevelLabel,
} from "./format";

function stopsLabel(option: FlightOption): string {
  if (option.stops === 0) return "직항";
  const where = option.layovers
    .map((l) => `${l.id || l.name} ${formatDuration(l.durationMinutes)}${l.overnight ? " (1박)" : ""}`)
    .join(", ");
  return `경유 ${option.stops}회${where ? ` · ${where}` : ""}`;
}

function FlightCard({ option, cheapest }: { option: FlightOption; cheapest: boolean }) {
  const first = option.segments[0];
  const last = option.segments[option.segments.length - 1];
  const plusDays = dayOffset(option.departureTime, option.arrivalTime);
  const logo = first?.airlineLogo;

  return (
    <li
      className={cardClass({
        className: cn("flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6", cheapest && "border-accent"),
      })}
    >
      {/* 항공사 */}
      <div className="flex min-w-0 items-center gap-3 sm:w-48">
        {logo ? (
          // 외부 CDN 로고라 next/image 최적화 대상이 아니다
          <img src={logo} alt="" className="size-8 shrink-0 rounded-control bg-surface-2 object-contain" />
        ) : (
          <div className="size-8 shrink-0 rounded-control bg-surface-2" aria-hidden />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-fg">{option.airlines.join(" · ") || "항공사 미상"}</div>
          <div className="truncate text-xs text-fg-subtle">
            {option.segments.map((s) => s.flightNumber).filter(Boolean).join(", ")}
          </div>
        </div>
      </div>

      {/* 시간 */}
      <div className="flex flex-1 items-center gap-3">
        <div className="text-center">
          <div className="text-lg font-semibold text-fg tabular-nums">{clockOf(option.departureTime)}</div>
          <div className="text-xs text-fg-subtle">{first?.departureAirport.id}</div>
        </div>

        <div className="flex flex-1 flex-col items-center gap-1">
          <div className="text-xs text-fg-muted">{formatDuration(option.totalDurationMinutes)}</div>
          <div className="h-px w-full bg-line" aria-hidden />
          <div className={cn("text-xs", option.stops === 0 ? "text-success-soft-fg" : "text-fg-muted")}>
            {stopsLabel(option)}
          </div>
        </div>

        <div className="text-center">
          <div className="text-lg font-semibold text-fg tabular-nums">
            {clockOf(option.arrivalTime)}
            {plusDays > 0 && <sup className="ml-0.5 text-xs text-danger-soft-fg">+{plusDays}</sup>}
          </div>
          <div className="text-xs text-fg-subtle">{last?.arrivalAirport.id}</div>
        </div>
      </div>

      {/* 가격 */}
      <div className="flex items-center justify-between gap-2 sm:w-44 sm:flex-col sm:items-end">
        <div className="flex gap-1">
          {cheapest && <Badge tone="accent">최저가</Badge>}
          {option.best && <Badge tone="info">추천</Badge>}
        </div>
        <div className="text-lg font-bold text-fg tabular-nums">{formatPrice(option.price)}</div>
      </div>
    </li>
  );
}

export default function FlightResults({ result }: { result: FlightSearchResult }) {
  const [nonstopOnly, setNonstopOnly] = useState(false);
  const { query, priceInsights } = result;

  const visible = useMemo(
    () => (nonstopOnly ? result.options.filter((o) => o.stops === 0) : result.options),
    [nonstopOnly, result.options]
  );
  const cheapestPrice = visible.find((o) => o.price != null)?.price ?? null;
  const level = priceLevelLabel(priceInsights?.priceLevel ?? null);

  return (
    <section aria-label="검색 결과" className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-fg">
            {query.from} → {query.to}
            <span className="ml-2 text-sm font-normal text-fg-muted">
              {formatDateLabel(query.date)}
              {query.returnDate && ` ~ ${formatDateLabel(query.returnDate)}`} · 성인 {query.adults}명 ·{" "}
              {query.tripType === "round" ? "왕복" : "편도"}
            </span>
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {result.lowestPrice != null ? (
              <>
                최저가 <strong className="text-fg">{formatPrice(result.lowestPrice)}</strong>
              </>
            ) : (
              "가격 정보가 있는 항공편이 없습니다"
            )}
            {level && ` · ${level}`}
            {priceInsights?.typicalRange &&
              ` (보통 ${formatPrice(priceInsights.typicalRange[0])} ~ ${formatPrice(priceInsights.typicalRange[1])})`}
          </p>
        </div>

        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-3 text-sm text-fg-muted hover:border-line-strong">
          <input
            type="checkbox"
            checked={nonstopOnly}
            onChange={(e) => setNonstopOnly(e.target.checked)}
            className="size-4 accent-accent"
          />
          직항만
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          className="mt-4"
          title={result.options.length === 0 ? "조건에 맞는 항공편이 없습니다" : "직항 항공편이 없습니다"}
          description="날짜나 공항을 바꿔 다시 검색해 보세요."
        />
      ) : (
        <ul className="mt-4 space-y-3" aria-label={`항공편 ${visible.length}개`}>
          {visible.map((option) => (
            <FlightCard key={option.id} option={option} cheapest={option.price != null && option.price === cheapestPrice} />
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-1 text-xs text-fg-subtle">
        {query.tripType === "round" && (
          <p>왕복 가격은 왕복 총액입니다. 표시된 구간은 가는 편이며, 오는 편은 Google 항공편에서 고를 수 있습니다.</p>
        )}
        <p>
          가격은 {new Date(result.fetchedAt).toLocaleString("ko-KR")} 조회 기준이며 실제 예약 가격과 다를 수 있습니다.
          {result.cached && " (30분 안에 같은 조건으로 검색한 결과를 다시 보여줍니다)"}
        </p>
        {result.googleFlightsUrl && (
          <p>
            <a
              href={result.googleFlightsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent-soft-fg underline underline-offset-2"
            >
              Google 항공편에서 예약하기 ↗
            </a>
          </p>
        )}
      </div>
    </section>
  );
}
