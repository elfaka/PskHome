import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { server } from "@/test/mocks/server";

import StockSimulator from "./StockSimulator";

// canvas 차트는 jsdom 에서 그릴 수 없다 → 받은 데이터만 노출하는 가짜로 바꾼다.
vi.mock("./CandleChart", () => ({
  default: ({ data }: { data: { timeframe: string; candles: unknown[] } }) => (
    <div data-testid="candle-chart">
      {data.timeframe}:{data.candles.length}
    </div>
  ),
}));

/** 넓은 화면용·좁은 화면용 검색창이 둘 다 그려진다 (CSS 로 하나만 보인다). */
const searchBox = () => screen.getByLabelText("종목 검색", { selector: "#stocksim-search" });

describe("StockSimulator", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the quote header with price, change and key stats", async () => {
    render(<StockSimulator />);

    const header = screen.getByRole("region", { name: "종목 시세" });
    expect(await within(header).findByText("77,000")).toBeInTheDocument();
    expect(within(header).getByText(/▲ 1,000 \(\+1\.32%\)/)).toBeInTheDocument();
    expect(within(header).getByText("시가총액")).toBeInTheDocument();
    expect(within(header).getByText("11.66배")).toBeInTheDocument();
  });

  it("draws the chart and switches timeframe", async () => {
    const user = userEvent.setup();
    render(<StockSimulator />);

    expect(await screen.findByTestId("candle-chart")).toHaveTextContent("1d:60");

    await user.click(screen.getByRole("tab", { name: "주" }));
    expect(await screen.findByText("1w:60")).toBeInTheDocument();
  });

  it("shows the buy/sell signal with a reason for each factor and the disclaimer", async () => {
    render(<StockSimulator />);

    expect(await screen.findByText("종합 점수 +18점으로 '매수' 신호입니다.", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/RSI 28\.0 로 과매도 구간/)).toBeInTheDocument();
    expect(screen.getByText("데이터 없음")).toBeInTheDocument();
    expect(screen.getByText(/투자 권유가 아닙니다/)).toBeInTheDocument();
  });

  it("shows valuation metrics and investor flows in their tabs", async () => {
    const user = userEvent.setup();
    render(<StockSimulator />);

    await user.click(screen.getByRole("tab", { name: "투자 지표" }));
    const value = await screen.findByRole("region", { name: "가치" });
    expect(within(value).getByText("6,605원")).toBeInTheDocument();
    expect(screen.getByText(/2025 사업보고서/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "투자자 동향" }));
    expect(await screen.findByText(/외국인 5일 누적/)).toBeInTheDocument();
  });

  it("renders the orderbook and switches the order to sell when a bid is clicked", async () => {
    const user = userEvent.setup();
    render(<StockSimulator />);

    const book = screen.getByRole("region", { name: "호가" });
    await user.click(await within(book).findByRole("button", { name: /매수호가 77,000원/ }));

    const order = screen.getByRole("form", { name: "주문" });
    expect(within(order).getByRole("button", { name: "시장가 매도" })).toBeInTheDocument();
  });

  it("selects a stock from search results", async () => {
    const user = userEvent.setup();
    render(<StockSimulator />);

    await user.type(searchBox(), "SK");
    const results = await screen.findByRole("list", { name: "검색 결과" });
    await user.click(within(results).getByRole("button", { name: /SK하이닉스/ }));

    expect(await screen.findByRole("heading", { name: "SK하이닉스" })).toBeInTheDocument();
  });

  it("adds the stock to the watchlist with the star", async () => {
    const user = userEvent.setup();
    render(<StockSimulator />);

    // 기본 관심종목에 삼성전자가 있다 → 빼고 다시 넣는다.
    const star = await screen.findByRole("button", { name: "관심종목에서 빼기" });
    await user.click(star);
    expect(screen.getByRole("button", { name: "관심종목에 추가" })).toHaveAttribute("aria-pressed", "false");
    expect(JSON.parse(localStorage.getItem("stocksim.watchlist") ?? "[]")).not.toContainEqual(
      expect.objectContaining({ symbol: "005930" })
    );
  });

  it("places a market buy and shows the fill", async () => {
    const user = userEvent.setup();
    render(<StockSimulator />);

    const order = screen.getByRole("form", { name: "주문" });
    const quantity = within(order).getByLabelText("수량 (주)");
    await user.clear(quantity);
    await user.type(quantity, "2");

    const submit = within(order).getByRole("button", { name: "시장가 매수" });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(await within(order).findByRole("alert")).toHaveTextContent("삼성전자 2주 매수 체결");
  });

  it("shows the backend error when an order is rejected", async () => {
    server.use(
      http.post("/api/stocksim/orders", () =>
        HttpResponse.json(
          { error: { code: "INSUFFICIENT_QUANTITY", message: "보유 수량이 부족합니다. (보유 0주)" } },
          { status: 400 }
        )
      )
    );
    const user = userEvent.setup();
    render(<StockSimulator />);

    const order = screen.getByRole("form", { name: "주문" });
    await user.click(within(order).getByRole("button", { name: "매도" }));
    const submit = within(order).getByRole("button", { name: "시장가 매도" });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(await within(order).findByRole("alert")).toHaveTextContent("보유 수량이 부족합니다.");
  });

  it("disables buying more than the cash allows", async () => {
    const user = userEvent.setup();
    render(<StockSimulator />);

    const order = screen.getByRole("form", { name: "주문" });
    await waitFor(() => expect(within(order).getByText("120주")).toBeInTheDocument()); // 9,300,000 / 77,000
    const quantity = within(order).getByLabelText("수량 (주)");
    await user.clear(quantity);
    await user.type(quantity, "1000");

    expect(within(order).getByText("예수금이 부족합니다.")).toBeInTheDocument();
    expect(within(order).getByRole("button", { name: "시장가 매수" })).toBeDisabled();
  });

  it("shows a market data error such as missing Toss keys", async () => {
    server.use(
      http.get("/api/stocksim/stocks/:symbol/overview", () =>
        HttpResponse.json(
          { error: { code: "TOSS_NOT_CONFIGURED", message: "토스 API 키가 설정되지 않았습니다." } },
          { status: 503 }
        )
      )
    );
    render(<StockSimulator />);

    const header = screen.getByRole("region", { name: "종목 시세" });
    expect(await within(header).findByText("토스 API 키가 설정되지 않았습니다.")).toBeInTheDocument();
  });
});
