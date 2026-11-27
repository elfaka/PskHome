import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { mockTraderChart, mockTraderStatus } from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";

import TraderDashboard from "./TraderDashboard";

// canvas 차트는 jsdom 에서 그릴 수 없다 — 받은 데이터만 보여주는 가짜로 바꾼다
vi.mock("./TraderCandleChart", () => ({
  default: ({ data }: { data: { symbol: string; interval: number; bars: unknown[]; fills: unknown[] } }) => (
    <div data-testid="trader-candle-chart">
      {data.symbol}:{data.interval}:{data.bars.length}:{data.fills.length}
    </div>
  ),
}));

function renderDashboard(props: { totpEnabled?: boolean; stepUpUntil?: string | null } = {}) {
  const onLogout = vi.fn(async () => {});
  render(<TraderDashboard username="owner" onLogout={onLogout} totpEnabled {...props} />);
  return { onLogout, user: userEvent.setup() };
}

async function openTab(user: ReturnType<typeof userEvent.setup>, label: string) {
  const nav = screen.getByRole("navigation", { name: "자동매매 메뉴" });
  await user.click(within(nav).getByRole("button", { name: label }));
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("TraderDashboard", () => {
  it("shows the status bar: running, paper mode, quote and DB health", async () => {
    renderDashboard();
    expect(await screen.findByText("실행 중")).toBeInTheDocument();
    expect(screen.getByText("모의")).toBeInTheDocument();
    expect(screen.getByText("정상")).toBeInTheDocument();
    expect(screen.getByText("장중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "긴급 정지" })).toBeInTheDocument();
  });

  it("shows key numbers from decimal strings: equity, P&L, cumulative return, MDD", async () => {
    renderDashboard();
    expect(await screen.findByText("10,105,926")).toBeInTheDocument();
    expect(screen.getByText("+105,926")).toBeInTheDocument();
    expect(screen.getByText("+1.06%")).toBeInTheDocument();
    expect((await screen.findAllByText("-0.45%")).length).toBeGreaterThan(0);
  });

  it("draws the symbol chart with fills and the latest indicators, and switches symbol and interval", async () => {
    const asked: string[] = [];
    server.use(
      http.get("/api/trader/chart", ({ request }) => {
        const u = new URL(request.url);
        asked.push(`${u.searchParams.get("symbol")}:${u.searchParams.get("interval")}`);
        return HttpResponse.json({ ...mockTraderChart, symbol: u.searchParams.get("symbol"), interval: Number(u.searchParams.get("interval")) });
      })
    );
    const { user } = renderDashboard();
    const chart = await screen.findByRole("region", { name: "종목 차트" });
    expect(await within(chart).findByTestId("trader-candle-chart")).toHaveTextContent("005930:60:2:1");
    // 범례: 보유 중이면 평균단가·손절·목표가
    expect(within(chart).getByText(/보유 13주 · 평균 70,171/)).toBeInTheDocument();
    expect(within(chart).getByText("69,400")).toBeInTheDocument();

    const ind = screen.getByRole("region", { name: "종목 지표" });
    expect(within(ind).getByText("+0.21%")).toBeInTheDocument(); // VWAP 대비
    expect(within(ind).getByText("과매수 구간 (70 이상)")).toBeInTheDocument();
    expect(within(ind).getByText("1.82배")).toBeInTheDocument();
    expect(within(ind).getByText("매수 조건 충족 (1.5배 이상)")).toBeInTheDocument();

    await user.click(within(chart).getByRole("button", { name: "5분" }));
    expect(await within(chart).findByText("005930:300:2:1")).toBeInTheDocument();
    await user.click(within(chart).getByRole("button", { name: "000660" }));
    expect(await within(chart).findByText("000660:300:2:1")).toBeInTheDocument();
    expect(asked).toEqual(["005930:60", "005930:300", "000660:300"]);
  });

  it("shows score trend with thresholds, score parts and a hover readout", async () => {
    const { user } = renderDashboard();
    const trend = await screen.findByRole("region", { name: "점수 추이 (점수 전략)" });
    const plot = await within(trend).findByRole("img", { name: /점수 추이 2개 판단/ });
    expect(within(trend).getByText("매수 80")).toBeInTheDocument();
    expect(within(trend).getByText("합계 57")).toBeInTheDocument();
    plot.focus();
    await user.keyboard("{ArrowRight}");
    const tip = within(trend).getByRole("status");
    expect(tip).toHaveTextContent("09:30");
    expect(tip).toHaveTextContent("합계42");

    const parts = screen.getByRole("region", { name: "점수 항목 (시장 맥락)" });
    expect(within(parts).getByText("코스피 +0.32%")).toBeInTheDocument();
    expect(within(parts).getByText(/사용 안 함 — VIX 데이터 없음·지연/)).toBeInTheDocument();
  });

  it("shows today's stats and rejection reasons", async () => {
    renderDashboard();
    expect(await screen.findByText("4건")).toBeInTheDocument();
    expect(screen.getByText("매수 2 · 매도 2")).toBeInTheDocument();
    expect(screen.getByText("오늘 1/2 · 전체 5/10")).toBeInTheDocument();
    expect(screen.getByText("+438")).toBeInTheDocument(); // 거래당 평균 손익
    expect(screen.getByText("2,920")).toBeInTheDocument(); // 오늘 비용
    const rej = screen.getByRole("region", { name: "오늘 막힌 주문 (위험 관리)" });
    expect(within(rej).getByText("손익비 부족")).toBeInTheDocument();
    expect(within(rej).getByText("7건")).toBeInTheDocument();
    expect(within(rej).getByText("예: 비용 차감 손익비 0.92 < 1.5")).toBeInTheDocument();
  });

  it("shows equity with a drawdown chart that reads out values", async () => {
    const { user } = renderDashboard();
    const eq = await screen.findByRole("region", { name: "평가금액·낙폭" });
    const plot = await within(eq).findByRole("img", { name: /평가금액 추이 3개 점/ });
    plot.focus();
    await user.keyboard("{ArrowLeft}");
    expect(within(eq).getByRole("status")).toHaveTextContent("지금");
    expect(within(eq).getByRole("status")).toHaveTextContent("-0.45%");
  });

  it("shows risk gauges and positions with weights in the down tone for losses", async () => {
    renderDashboard();
    const risk = await screen.findByRole("region", { name: "리스크" });
    expect(within(risk).getByRole("meter", { name: "하루 손실 한도 사용률" })).toBeInTheDocument();
    expect(await within(risk).findByRole("meter", { name: "005930" })).toHaveAttribute("aria-valuenow", "9.7");
    const positions = screen.getByRole("region", { name: "보유 종목" });
    const pnl = within(positions).getByText("-1,400");
    expect(pnl.className).toContain("text-info-soft-fg");
  });

  it("lists strategies with a status bar of recent decisions", async () => {
    renderDashboard();
    const list = await screen.findByRole("region", { name: "전략" });
    expect(await within(list).findByText("ma_cross")).toBeInTheDocument();
    expect(within(list).getByText(/그림자 \(신호만 기록\)/)).toBeInTheDocument();
    expect(within(list).getByRole("switch", { name: "ma_cross 끄기" })).toHaveAttribute("aria-checked", "true");
  });

  it("turns a strategy off without a code, and asks for the code to turn it back on", async () => {
    const sent: unknown[] = [];
    server.use(
      http.post("/api/trader/control/strategies/:id", async ({ request, params }) => {
        sent.push([params.id, await request.json()]);
        return HttpResponse.json({ ok: true });
      })
    );
    const { user } = renderDashboard({ stepUpUntil: null });
    const list = await screen.findByRole("region", { name: "전략" });
    await user.click(await within(list).findByRole("switch", { name: "ma_cross 끄기" }));
    expect(screen.queryByRole("dialog", { name: "2단계 인증" })).not.toBeInTheDocument();
    expect(sent).toEqual([["ma_cross", { enabled: false }]]);

    await user.click(within(list).getByRole("switch", { name: "ma_cross 켜기" }));
    const dialog = await screen.findByRole("dialog", { name: "2단계 인증" });
    await user.type(within(dialog).getByLabelText("인증 코드"), "123456");
    await user.click(within(dialog).getByRole("button", { name: "확인" }));
    await vi.waitFor(() => expect(sent).toEqual([["ma_cross", { enabled: false }], ["ma_cross", { enabled: true }]]));
  });

  it("halts with a reason (no code) and offers resume when halted", async () => {
    let body: unknown = null;
    server.use(
      http.post("/api/trader/control/halt", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true });
      })
    );
    const { user } = renderDashboard();
    await user.click(await screen.findByRole("button", { name: "긴급 정지" }));
    const dialog = screen.getByRole("dialog", { name: "긴급 정지" });
    await user.type(within(dialog).getByLabelText(/사유/), "점검");
    await user.click(within(dialog).getByRole("button", { name: "지금 정지" }));
    await vi.waitFor(() => expect(body).toEqual({ reason: "점검" }));
  });

  it("shows the halt alert and needs the confirm word and code to resume", async () => {
    server.use(
      http.get("/api/trader/status", () =>
        HttpResponse.json({
          ...mockTraderStatus,
          killswitch: { halted: true, reason: "manual", updatedAt: null, updatedBy: "web:owner" },
          alerts: [{ level: "error", code: "HALTED", message: "긴급 정지 상태입니다 — manual" }],
        })
      )
    );
    const { user } = renderDashboard({ stepUpUntil: null });
    expect(await screen.findByText("긴급 정지 상태입니다 — manual")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "재개…" }));
    const dialog = screen.getByRole("dialog", { name: "엔진 재개" });
    const submit = within(dialog).getByRole("button", { name: "재개" });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/재개.*입력/), "재개");
    await user.click(submit);
    expect(await screen.findByRole("dialog", { name: "2단계 인증" })).toBeInTheDocument();
  });

  it("filters the activity log by level", async () => {
    const { user } = renderDashboard();
    await openTab(user, "활동 로그");
    const log = await screen.findByRole("region", { name: "활동 로그" });
    expect(await within(log).findByText(/매수 체결 13주/)).toBeInTheDocument();
    await user.click(within(log).getByRole("button", { name: "경고 1" }));
    expect(within(log).queryByText(/매수 체결 13주/)).not.toBeInTheDocument();
    expect(within(log).getByText("봉 누락 · 3")).toBeInTheDocument();
  });

  it("keeps decisions and signal performance on their own tab", async () => {
    const { user } = renderDashboard();
    await openTab(user, "판단·성과");
    const table = await screen.findByRole("region", { name: "판단 기록" });
    expect(await within(table).findByText("그림자")).toBeInTheDocument();
    expect(within(table).getByText(/손절 69,985 \/ 목표 70,435 · R 1.05/)).toBeInTheDocument();
    const perf = screen.getByRole("region", { name: "신호 성과" });
    expect(await within(perf).findByText("+0.12%")).toBeInTheDocument();
    const bars = screen.getByRole("region", { name: "신호 성과 — 기간별 평균 수익률" });
    expect(within(bars).getByText("intraday_score · BUY")).toBeInTheDocument();
    expect(within(bars).getByText("5분")).toBeInTheDocument();
    expect(within(bars).getByText(/승률 75% · 4/)).toBeInTheDocument();
  });

  it("reviews a settings change and saves only overrides after 2FA", async () => {
    let body: { values: Record<string, string | null> } | null = null;
    server.use(
      http.put("/api/trader/control/settings", async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ version: 2, overrides: {} });
      })
    );
    const { user } = renderDashboard({ stepUpUntil: "2099-01-01T00:00:00.000Z" });
    await openTab(user, "설정");
    const input = await screen.findByLabelText("슬리피지");
    expect(input).toHaveValue("5");
    expect(screen.getByLabelText("최소 손익비")).toHaveValue("1.2");
    await user.clear(input);
    await user.type(input, "7");
    await user.click(screen.getByRole("button", { name: "변경 검토" }));
    const dialog = screen.getByRole("dialog", { name: "설정 변경 검토" });
    expect(within(dialog).getByText("슬리피지")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "적용" }));
    await vi.waitFor(() => expect(body).not.toBeNull());
    expect(body!.values.slippage_bps).toBe("7");
    expect(body!.values.risk_min_risk_reward).toBe("1.2");
    expect(body!.values.commission_rate_buy).toBeNull();
    expect(await screen.findByText(/v2 저장됨/)).toBeInTheDocument();
  });

  it("disables settings changes and warns when 2FA is off", async () => {
    const { user } = renderDashboard({ totpEnabled: false });
    expect(await screen.findByText(/2단계 인증이 설정되지 않았습니다/)).toBeInTheDocument();
    await openTab(user, "설정");
    const input = await screen.findByLabelText("슬리피지");
    await user.clear(input);
    await user.type(input, "7");
    expect(screen.getByRole("button", { name: "변경 검토" })).toBeDisabled();
  });

  it("shows the backend error when the trader DB is not configured", async () => {
    server.use(
      http.get("/api/trader/status", () =>
        HttpResponse.json(
          { error: { code: "TRADER_DB_NOT_CONFIGURED", message: "자동매매 DB 접속 정보가 설정되지 않았습니다." } },
          { status: 503 }
        )
      )
    );
    renderDashboard();
    expect(await screen.findByText("자동매매 DB 접속 정보가 설정되지 않았습니다.")).toBeInTheDocument();
  });

  it("goes back to login when the session has expired (401)", async () => {
    server.use(
      http.get("/api/trader/status", () =>
        HttpResponse.json({ error: { code: "UNAUTHORIZED", message: "Trader login is required." } }, { status: 401 })
      )
    );
    const onSessionExpired = vi.fn();
    render(<TraderDashboard username="owner" onLogout={async () => {}} onSessionExpired={onSessionExpired} />);
    await vi.waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
  });

  it("logs out", async () => {
    const { onLogout, user } = renderDashboard();
    await user.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(onLogout).toHaveBeenCalled();
  });
});
