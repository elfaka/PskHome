import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { server } from "@/test/mocks/server";

import { toAirportCode } from "./airports";
import { parsePostData } from "./booking";
import FlightSearch from "./FlightSearch";
import { dayOffset, formatDuration } from "./format";

describe("FlightSearch", () => {
  it("비로그인이면 검색 폼 대신 로그인 안내를 보여준다", async () => {
    server.use(http.get("/api/auth/me", () => HttpResponse.json({ authenticated: false })));
    render(<FlightSearch />);

    expect(await screen.findByRole("heading", { name: "로그인이 필요합니다" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google 로 로그인" })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "항공권 검색" })).not.toBeInTheDocument();
  });

  it("로그인하면 남은 검색 횟수와 검색 폼을 보여준다", async () => {
    render(<FlightSearch />);

    expect(await screen.findByRole("form", { name: "항공권 검색" })).toBeInTheDocument();
    expect(await screen.findByText("오늘 남은 검색 30회")).toBeInTheDocument();
    // 편도가 기본이라 귀국일 칸이 없다
    expect(screen.queryByLabelText("귀국일")).not.toBeInTheDocument();
  });

  it("검색하면 가격순 결과·최저가·경유 정보를 보여준다", async () => {
    const user = userEvent.setup();
    render(<FlightSearch />);

    await user.type(await screen.findByLabelText("도착지"), "도쿄");
    await user.click(screen.getByRole("button", { name: "최저가 검색" }));

    const results = await screen.findByRole("region", { name: "검색 결과" });
    expect(within(results).getByText("180,000원", { selector: "strong" })).toBeInTheDocument();

    const items = within(within(results).getByRole("list", { name: "항공편 2개" })).getAllByRole("listitem");
    expect(within(items[0]).getByText("최저가")).toBeInTheDocument();
    expect(within(items[0]).getByText(/경유 1회 · PUS 2시간/)).toBeInTheDocument();
    expect(within(items[1]).getByText("직항")).toBeInTheDocument();
    expect(within(items[1]).getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("오늘 남은 검색 29회")).toBeInTheDocument();
  });

  it("직항만 보기를 켜면 경유편을 숨긴다", async () => {
    const user = userEvent.setup();
    render(<FlightSearch />);

    await user.type(await screen.findByLabelText("도착지"), "NRT");
    await user.click(screen.getByRole("button", { name: "최저가 검색" }));
    await screen.findByRole("region", { name: "검색 결과" });

    await user.click(screen.getByLabelText("직항만"));
    expect(screen.getByRole("list", { name: "항공편 1개" })).toBeInTheDocument();
    expect(screen.queryByText(/경유 1회/)).not.toBeInTheDocument();
  });

  it("왕복은 귀국일을 함께 보내고 왕복 총액 안내를 보여준다", async () => {
    let seen: URLSearchParams | null = null;
    server.use(
      http.get("/api/flights/search", ({ request }) => {
        seen = new URL(request.url).searchParams;
        return HttpResponse.json({
          query: { from: "ICN", to: "NRT", date: "2026-12-01", returnDate: "2026-12-05", tripType: "round", adults: 1 },
          currency: "KRW",
          lowestPrice: null,
          options: [],
          priceInsights: null,
          googleFlightsUrl: null,
          fetchedAt: "2026-11-04T01:00:00.000Z",
          remainingSearches: 28,
          cached: true,
        });
      })
    );
    const user = userEvent.setup();
    render(<FlightSearch />);

    await user.click(await screen.findByRole("button", { name: "왕복" }));
    expect(screen.getByLabelText("귀국일")).toBeInTheDocument();
    await user.type(screen.getByLabelText("도착지"), "NRT");
    await user.click(screen.getByRole("button", { name: "최저가 검색" }));

    expect(await screen.findByText("조건에 맞는 항공편이 없습니다")).toBeInTheDocument();
    expect(screen.getByText(/왕복 가격은 왕복 총액/)).toBeInTheDocument();
    expect(seen!.get("tripType")).toBe("round");
    expect(seen!.get("returnDate")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("목록에 없는 도착지는 요청하지 않고 안내한다", async () => {
    const user = userEvent.setup();
    render(<FlightSearch />);

    await user.type(await screen.findByLabelText("도착지"), "아무데나");
    await user.click(screen.getByRole("button", { name: "최저가 검색" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/IATA 코드 3자리/);
  });

  it("백엔드 오류 메시지를 그대로 보여준다", async () => {
    server.use(
      http.get("/api/flights/search", () =>
        HttpResponse.json(
          { error: { code: "DAILY_LIMIT_EXCEEDED", message: "오늘 검색 한도(30회)를 모두 썼습니다." } },
          { status: 429 }
        )
      )
    );
    const user = userEvent.setup();
    render(<FlightSearch />);

    await user.type(await screen.findByLabelText("도착지"), "KIX");
    await user.click(screen.getByRole("button", { name: "최저가 검색" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("오늘 검색 한도(30회)를 모두 썼습니다.");
  });
});

describe("flights helpers", () => {
  it.each([
    ["ICN", "ICN"],
    ["kix", "KIX"],
    ["도쿄 나리타국제공항 (NRT)", "NRT"],
    ["오사카", "KIX"],
    ["", null],
    ["아무데나", null],
  ])("toAirportCode(%s) → %s", (input, code) => {
    expect(toAirportCode(input)).toBe(code);
  });

  it("소요 시간과 날짜 넘김을 계산한다", () => {
    expect(formatDuration(140)).toBe("2시간 20분");
    expect(formatDuration(60)).toBe("1시간");
    expect(formatDuration(45)).toBe("45분");
    expect(dayOffset("2026-12-01 23:00", "2026-12-02 01:20")).toBe(1);
  });
});

describe("판매처로 이동", () => {
  async function searchOneway(user: ReturnType<typeof userEvent.setup>) {
    render(<FlightSearch />);
    await user.type(await screen.findByLabelText("도착지"), "NRT");
    await user.click(screen.getByRole("button", { name: "최저가 검색" }));
    return screen.findByRole("list", { name: "항공편 2개" });
  }

  it("판매처 보기를 누르면 가격순 판매처와 이동 버튼을 보여주고 남은 횟수를 갱신한다", async () => {
    const user = userEvent.setup();
    const list = await searchOneway(user);
    const first = within(list).getAllByRole("listitem")[0];

    await user.click(within(first).getByRole("button", { name: /판매처 보기/ }));

    const sellers = await within(first).findByRole("region", { name: "판매처" });
    const rows = within(sellers).getAllByRole("listitem");
    expect(within(rows[0]).getByText("트립닷컴")).toBeInTheDocument();
    // 검색 결과 가격(180,000원)과 같은 판매처 표시
    expect(within(rows[0]).getByText("검색 가격")).toBeInTheDocument();
    expect(within(rows[1]).getByText("항공사 공식")).toBeInTheDocument();
    expect(within(rows[2]).getByText("전화 예약 02-000-0000")).toBeInTheDocument();
    expect(screen.getByText("오늘 남은 검색 28회")).toBeInTheDocument();
  });

  it("사이트로 이동은 Google 중계 주소로 post_data 를 POST 하는 폼을 새 탭으로 보낸다", async () => {
    const submitted: { action: string; method: string; target: string; fields: [string, string][] }[] = [];
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (this: HTMLFormElement) {
      submitted.push({
        action: this.action,
        method: this.method,
        target: this.target,
        fields: [...new FormData(this).entries()].map(([k, v]) => [k, String(v)]),
      });
    });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);

    const user = userEvent.setup();
    const list = await searchOneway(user);
    const first = within(list).getAllByRole("listitem")[0];
    await user.click(within(first).getByRole("button", { name: /판매처 보기/ }));
    const rows = within(await within(first).findByRole("region", { name: "판매처" })).getAllByRole("listitem");

    await user.click(within(rows[0]).getByRole("button", { name: "사이트로 이동 ↗" }));
    expect(submitted).toEqual([
      { action: "https://www.google.com/travel/clk/f", method: "post", target: "_blank", fields: [["u", "AAA_bbb-ccc"]] },
    ]);
    // 폼은 보낸 뒤 지운다
    expect(document.querySelector("form[target=_blank]")).toBeNull();

    // post_data 가 없는 판매처는 주소로 바로 연다
    await user.click(within(rows[1]).getByRole("button", { name: "사이트로 이동 ↗" }));
    expect(open).toHaveBeenCalledWith("https://www.jejuair.net/booking", "_blank", "noopener,noreferrer");

    submit.mockRestore();
    open.mockRestore();
  });

  it("왕복은 오는 편을 고른 뒤 그 조합의 판매처를 보여준다", async () => {
    const user = userEvent.setup();
    render(<FlightSearch />);

    await user.click(await screen.findByRole("button", { name: "왕복" }));
    await user.type(screen.getByLabelText("도착지"), "NRT");
    await user.click(screen.getByRole("button", { name: "최저가 검색" }));

    const first = within(await screen.findByRole("list", { name: "항공편 2개" })).getAllByRole("listitem")[0];
    await user.click(within(first).getByRole("button", { name: /오는 편 고르기/ }));

    const returns = await within(first).findByRole("region", { name: "오는 편" });
    expect(within(returns).getByText("410,000원")).toBeInTheDocument();
    await user.click(within(returns).getByRole("button", { name: "이 편 선택" }));

    expect(await within(first).findByRole("region", { name: "판매처" })).toBeInTheDocument();
    expect(within(first).getByText(/왕복 410,000원/)).toBeInTheDocument();
  });
});

describe("parsePostData", () => {
  it("폼 인코딩을 풀어 이름·값으로 나눈다", () => {
    expect(parsePostData("u=AAA%2Bb%3D&x=1+2&flag")).toEqual([
      ["u", "AAA+b="],
      ["x", "1 2"],
      ["flag", ""],
    ]);
  });
});
