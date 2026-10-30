import { describe, it, expect } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { server } from "@/test/mocks/server";

import StockSimulator from "./StockSimulator";

describe("StockSimulator", () => {
  it("shows the portfolio summary and the default stock quote", async () => {
    render(<StockSimulator />);

    expect(await screen.findByText("10,070,000원")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "삼성전자" })).toBeInTheDocument();

    const holdings = screen.getByRole("region", { name: "보유 종목" });
    expect(within(holdings).getByText("+70,000원")).toBeInTheDocument();
  });

  it("selects a stock from search results", async () => {
    const user = userEvent.setup();
    render(<StockSimulator />);

    await user.type(screen.getByLabelText("종목 검색"), "SK");
    await user.click(await screen.findByRole("button", { name: /SK하이닉스/ }));

    expect(await screen.findByRole("heading", { name: "SK하이닉스" })).toBeInTheDocument();
    expect(screen.getByLabelText("종목 검색")).toHaveValue("");
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
    await screen.findByText("10,070,000원");
    const quantity = within(order).getByLabelText("수량 (주)");
    await user.clear(quantity);
    await user.type(quantity, "1000");

    expect(within(order).getByText("예수금이 부족합니다.")).toBeInTheDocument();
    expect(within(order).getByRole("button", { name: "시장가 매수" })).toBeDisabled();
  });

  it("shows a market data error such as missing Toss keys", async () => {
    server.use(
      http.get("/api/stocksim/quotes", () =>
        HttpResponse.json(
          { error: { code: "TOSS_NOT_CONFIGURED", message: "토스 API 키가 설정되지 않았습니다." } },
          { status: 503 }
        )
      )
    );
    render(<StockSimulator />);

    expect(await screen.findByText("토스 API 키가 설정되지 않았습니다.")).toBeInTheDocument();
  });
});
