import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { server } from "@/test/mocks/server";

import TraderDashboard from "./TraderDashboard";

function renderDashboard() {
  const onLogout = vi.fn(async () => {});
  render(<TraderDashboard username="owner" onLogout={onLogout} />);
  return { onLogout };
}

describe("TraderDashboard", () => {
  it("shows equity, cash and today's P&L formatted from decimal strings", async () => {
    renderDashboard();
    expect(await screen.findByText("10,105,926")).toBeInTheDocument();
    expect(screen.getByText("9,124,526")).toBeInTheDocument();
    expect(screen.getByText("+105,926")).toBeInTheDocument();
    expect(screen.getByText("가동 중")).toBeInTheDocument();
  });

  it("lists positions with unrealized P&L in the down tone", async () => {
    renderDashboard();
    const positions = await screen.findByRole("region", { name: "보유 종목" });
    expect(await within(positions).findByText("005930")).toBeInTheDocument();
    const pnl = within(positions).getByText("-1,400");
    expect(pnl.className).toContain("text-info-soft-fg");
  });

  it("shows decisions with score components, shadow badge and risk levels", async () => {
    renderDashboard();
    const table = await screen.findByRole("region", { name: "판단 기록" });
    expect(await within(table).findByText("그림자")).toBeInTheDocument();
    expect(within(table).getByText(/가격 30\/30 rules · 맥락 60\/60 rules · 이슈 0\/10 NOT_CONFIGURED/)).toBeInTheDocument();
    expect(within(table).getByText(/손절 69,985 \/ 목표 70,435 · R 1.05/)).toBeInTheDocument();
    expect(within(table).getByText("SHADOW")).toBeInTheDocument();
    expect(within(table).getByText("APPROVED")).toBeInTheDocument();
  });

  it("shows signal performance as percentages", async () => {
    renderDashboard();
    const perf = await screen.findByRole("region", { name: "신호 성과" });
    expect(await within(perf).findByText("+0.12%")).toBeInTheDocument();
    expect(within(perf).getByText("75%")).toBeInTheDocument();
  });

  it("shows the kill switch when halted", async () => {
    server.use(
      http.get("/api/trader/summary", async () => {
        const { mockTraderSummary } = await import("@/test/mocks/handlers");
        return HttpResponse.json({ ...mockTraderSummary, killswitch: { halted: true, reason: "manual", updatedAt: null } });
      })
    );
    renderDashboard();
    expect(await screen.findByText("중지됨 · manual")).toBeInTheDocument();
  });

  it("shows the backend error when the trader DB is not configured", async () => {
    server.use(
      http.get("/api/trader/summary", () =>
        HttpResponse.json(
          { error: { code: "TRADER_DB_NOT_CONFIGURED", message: "자동매매 DB 접속 정보가 설정되지 않았습니다." } },
          { status: 503 }
        )
      )
    );
    renderDashboard();
    expect(await screen.findByText("자동매매 DB 접속 정보가 설정되지 않았습니다.")).toBeInTheDocument();
  });

  it("logs out", async () => {
    const { onLogout } = renderDashboard();
    await userEvent.setup().click(screen.getByRole("button", { name: "로그아웃" }));
    expect(onLogout).toHaveBeenCalled();
  });
});
