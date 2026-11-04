"use client";

import { useEffect, useState } from "react";

import {
  FLIGHTS_LOGIN_URL,
  getFlightQuota,
  getMe,
  searchFlights,
  type FlightSearchResult,
  type TripType,
} from "@/api/flights";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Container from "@/components/ui/Container";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { Field, Input, Select } from "@/components/ui/Field";
import { cardClass } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errorMessage";

import { AIRPORTS, airportLabel, toAirportCode } from "./airports";
import FlightResults from "./FlightResults";
import { kstDatePlus } from "./format";

/** 출발일은 오늘부터 330일 안 (백엔드 규칙과 같다) */
const MAX_DAYS_AHEAD = 330;

type AuthState = { status: "loading" } | { status: "guest" } | { status: "member"; name?: string };

function LoginRequired() {
  return (
    <div className={cardClass({ className: "mx-auto mt-8 max-w-md p-6 sm:p-8" })}>
      <h2 className="text-lg font-semibold text-fg">로그인이 필요합니다</h2>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
        항공권 검색은 유료 검색 API 를 쓰기 때문에 Google 로그인한 사용자만 쓸 수 있고, 하루 검색 횟수가 정해져 있습니다.
      </p>
      <Button
        variant="primary"
        size="lg"
        full
        className="mt-6"
        onClick={() => {
          // 백엔드 OAuth2 엔드포인트로의 브라우저 이동이라 router.push 로는 안 된다
          window.location.href = FLIGHTS_LOGIN_URL;
        }}
      >
        Google 로 로그인
      </Button>
      <p className="mt-4 text-xs text-fg-subtle">로그인 후 이 화면으로 돌아옵니다.</p>
    </div>
  );
}

export default function FlightSearch() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [remaining, setRemaining] = useState<number | null>(null);

  const [tripType, setTripType] = useState<TripType>("oneway");
  const [from, setFrom] = useState("ICN");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(() => kstDatePlus(14));
  const [returnDate, setReturnDate] = useState(() => kstDatePlus(18));
  const [adults, setAdults] = useState(1);

  const [result, setResult] = useState<FlightSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await getMe();
        if (!alive) return;
        if (!me.authenticated) {
          setAuth({ status: "guest" });
          return;
        }
        setAuth({ status: "member", name: me.name });
        const quota = await getFlightQuota();
        if (alive) setRemaining(quota.remainingSearches);
      } catch {
        // 로그인 확인이 실패하면 로그인 안내를 보여준다
        if (alive) setAuth((prev) => (prev.status === "loading" ? { status: "guest" } : prev));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const today = kstDatePlus(0);
  const lastDay = kstDatePlus(MAX_DAYS_AHEAD);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const fromCode = toAirportCode(from);
    const toCode = toAirportCode(to);
    if (!fromCode || !toCode) {
      setError("출발지와 도착지를 공항 목록에서 고르거나 IATA 코드 3자리(예: ICN)로 입력하세요.");
      return;
    }
    if (fromCode === toCode) {
      setError("출발지와 도착지가 같습니다.");
      return;
    }
    if (tripType === "round" && returnDate < date) {
      setError("귀국일은 출발일 이후여야 합니다.");
      return;
    }

    setSearching(true);
    try {
      const res = await searchFlights({
        from: fromCode,
        to: toCode,
        date,
        tripType,
        adults,
        ...(tripType === "round" ? { returnDate } : {}),
      });
      setResult(res);
      setRemaining(res.remainingSearches);
    } catch (err) {
      setResult(null);
      setError(errorMessage(err, "항공권을 검색하지 못했습니다."));
    } finally {
      setSearching(false);
    }
  };

  return (
    <Container size="wide" className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Tool"
        title="항공권 최저가 검색"
        description="출발지·도착지·날짜를 넣으면 Google 항공편 실시간 결과를 가격이 낮은 순서로 보여줍니다."
        actions={
          auth.status === "member" && remaining != null ? (
            <Badge tone={remaining > 0 ? "accent" : "warning"}>오늘 남은 검색 {remaining}회</Badge>
          ) : undefined
        }
      />

      {auth.status === "loading" && <Skeleton className="mt-8 h-48 w-full" />}
      {auth.status === "guest" && <LoginRequired />}

      {auth.status === "member" && (
        <>
          <form
            aria-label="항공권 검색"
            onSubmit={submit}
            className={cardClass({ className: "mt-8 space-y-4 p-4 sm:p-5" })}
          >
            <div role="group" aria-label="여정" className="inline-flex gap-1 rounded-control bg-surface-2 p-1">
              {(
                [
                  ["oneway", "편도"],
                  ["round", "왕복"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={tripType === value}
                  onClick={() => setTripType(value)}
                  className={cn(
                    "h-8 rounded-control px-4 text-sm font-medium transition",
                    tripType === value ? "bg-accent text-accent-fg shadow-card" : "text-fg-muted hover:text-fg"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr]">
              <Field label="출발지" htmlFor="flight-from">
                <Input
                  id="flight-from"
                  list="flight-airports"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder="도시, 공항 또는 ICN"
                  autoComplete="off"
                />
              </Field>
              <Button
                className="self-end"
                onClick={swap}
                aria-label="출발지와 도착지 바꾸기"
                title="출발지와 도착지 바꾸기"
              >
                ⇄
              </Button>
              <Field label="도착지" htmlFor="flight-to">
                <Input
                  id="flight-to"
                  list="flight-airports"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="도시, 공항 또는 NRT"
                  autoComplete="off"
                />
              </Field>
            </div>

            <datalist id="flight-airports">
              {AIRPORTS.map((a) => (
                <option key={a.code} value={airportLabel(a)} />
              ))}
            </datalist>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="출발일" htmlFor="flight-date">
                <Input
                  id="flight-date"
                  type="date"
                  required
                  min={today}
                  max={lastDay}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              {tripType === "round" && (
                <Field label="귀국일" htmlFor="flight-return">
                  <Input
                    id="flight-return"
                    type="date"
                    required
                    min={date || today}
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                  />
                </Field>
              )}
              <Field label="성인" htmlFor="flight-adults">
                <Select id="flight-adults" value={adults} onChange={(e) => setAdults(Number(e.target.value))}>
                  {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}명
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={searching || remaining === 0}>
                {searching ? "검색 중..." : "최저가 검색"}
              </Button>
            </div>
          </form>

          {error && (
            <Alert className="mt-4" title="검색 실패">
              {error}
            </Alert>
          )}

          {searching && <Skeleton className="mt-8 h-64 w-full" />}
          {!searching && result && (
            // 새로 검색하면 펼쳐 둔 판매처 패널을 닫는다 (이전 검색의 토큰을 쓰지 않게)
            <FlightResults
              key={`${JSON.stringify(result.query)}@${result.fetchedAt}`}
              result={result}
              onRemaining={setRemaining}
            />
          )}
        </>
      )}
    </Container>
  );
}
