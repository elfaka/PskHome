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

  it("labels the closing auction (15:20~15:30) instead of regular trading", async () => {
    server.use(
      http.get("/api/trader/status", () => HttpResponse.json({ ...mockTraderStatus, marketPhase: "closing_auction" }))
    );
    renderDashboard();
    expect(await screen.findByText("마감 동시호가")).toBeInTheDocument();
    expect(screen.queryByText("장중")).not.toBeInTheDocument();
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

  it("shows today's symbols with net buying in 억 and held symbols outside the list, and opens a chart on click", async () => {
    const asked: string[] = [];
    server.use(
      http.get("/api/trader/chart", ({ request }) => {
        const sym = new URL(request.url).searchParams.get("symbol")!;
        asked.push(sym);
        return HttpResponse.json({ ...mockTraderChart, symbol: sym });
      })
    );
    const { user } = renderDashboard();
    const strip = await screen.findByRole("region", { name: "오늘의 종목" });
    expect(within(strip).getByText(/자동 \(외국인·기관 순매수 상위\) · 2026-11-26/)).toBeInTheDocument();
    expect(within(strip).getByText("SK하이닉스")).toBeInTheDocument();
    expect(within(strip).getByText("순매수 +350억")).toBeInTheDocument();
    expect(within(strip).getByText("항상 포함")).toBeInTheDocument();
    expect(within(strip).getByText("목록 밖 보유 — 청산까지 계속 봄")).toBeInTheDocument();
    expect(within(strip).getByText(/뺀 종목 1개/)).toBeInTheDocument();
    await user.click(within(strip).getByRole("button", { name: /SK하이닉스/ }));
    const chart = screen.getByRole("region", { name: "종목 차트" });
    expect(await within(chart).findByText("000660:60:2:1")).toBeInTheDocument();
    expect(asked.at(-1)).toBe("000660");
  });

  it("uses a dropdown for the chart symbol when many symbols are watched", async () => {
    server.use(
      http.get("/api/trader/chart", ({ request }) =>
        HttpResponse.json({
          ...mockTraderChart,
          symbol: new URL(request.url).searchParams.get("symbol"),
          symbols: ["005930", "000660", "035420", "036930", "009150"],
        })
      )
    );
    const { user } = renderDashboard();
    const chart = await screen.findByRole("region", { name: "종목 차트" });
    const pick = await within(chart).findByRole("combobox", { name: "종목" });
    expect(within(pick).getByRole("option", { name: "SK하이닉스 (000660)" })).toBeInTheDocument();
    await user.selectOptions(pick, "036930");
    expect(await within(chart).findByText("036930:60:2:1")).toBeInTheDocument();
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
    // 한글 이름 + 한 줄 요약 (개요는 짧게)
    expect(await within(list).findByText("이동평균 교차")).toBeInTheDocument();
    expect(within(list).getByText("장중 점수")).toBeInTheDocument();
    expect(within(list).getByText(/짧은 이동평균이 긴 이동평균을 위로 뚫으면 사고/)).toBeInTheDocument();
    expect(within(list).getByText(/그림자 \(주문 없이 신호·성과만 기록\)/)).toBeInTheDocument();
    expect(within(list).getByRole("switch", { name: "이동평균 교차 끄기" })).toHaveAttribute("aria-checked", "true");
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
    await user.click(await within(list).findByRole("switch", { name: "이동평균 교차 끄기" }));
    expect(screen.queryByRole("dialog", { name: "2단계 인증" })).not.toBeInTheDocument();
    expect(sent).toEqual([["ma_cross", { enabled: false }]]);

    await user.click(within(list).getByRole("switch", { name: "이동평균 교차 켜기" }));
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

  it("shows a clean activity log: categories, Korean titles, settings changes and collapsed repeats", async () => {
    const { user } = renderDashboard();
    await openTab(user, "활동 로그");
    const log = await screen.findByRole("region", { name: "활동 로그" });
    // 날짜 머리말
    expect(await within(log).findByText(/11월 26일/)).toBeInTheDocument();
    // 같은 거부가 연달아 나오면 한 줄 + "같은 내용 2번"
    expect(within(log).getAllByText("위험 관리가 주문을 막음 — 손익비 부족")).toHaveLength(1);
    const more = within(log).getByRole("button", { name: "같은 내용 2번 펼치기" });
    await user.click(more);
    expect(within(log).getByText(/비용 차감 손익비 0.95 < 1.5/)).toBeInTheDocument();
    // 설정 변경은 이름·단위로
    expect(within(log).getByText("최소 손익비")).toBeInTheDocument();
    expect(within(log).getByText("7bp")).toBeInTheDocument();
    expect(within(log).getByText("화면 · owner")).toBeInTheDocument();
    // 체결: 전략 한글 이름
    expect(within(log).getByText("매수 체결")).toBeInTheDocument();
    expect(within(log).getByText("13주 × 70,171원")).toBeInTheDocument();
    expect(within(log).getAllByText("이동평균 교차").length).toBeGreaterThan(0);

    // 수준·종류 거르기
    await user.click(within(log).getByRole("button", { name: "경고 3" }));
    expect(within(log).queryByText("매수 체결")).not.toBeInTheDocument();
    await user.click(within(log).getByRole("button", { name: "데이터" }));
    expect(within(log).getByText("봉 누락 3개")).toBeInTheDocument();
    expect(within(log).queryByText(/위험 관리가 주문을 막음/)).not.toBeInTheDocument();
    // 묶기를 끄면 하나씩
    await user.click(within(log).getByRole("button", { name: "모든 종류" }));
    await user.click(within(log).getByLabelText("같은 내용 묶기"));
    expect(within(log).getAllByText("위험 관리가 주문을 막음 — 손익비 부족")).toHaveLength(2);
  });

  it("keeps decisions and signal performance on their own tab", async () => {
    const { user } = renderDashboard();
    await openTab(user, "판단·성과");
    const table = await screen.findByRole("region", { name: "판단 기록" });
    expect(await within(table).findByText("그림자")).toBeInTheDocument();
    // 한글 전략·신호·사유·위험 관리 결과
    expect(within(table).getAllByText("이동평균 교차").length).toBeGreaterThanOrEqual(2); // 표 2줄 + 전략 고르기
    expect(within(table).getAllByText("골든크로스 — 짧은 이동평균이 긴 이동평균을 위로 돌파").length).toBe(2);
    expect(within(table).getByText("주문 승인")).toBeInTheDocument();
    expect(within(table).getByText("기록만 (그림자)")).toBeInTheDocument();
    expect(within(table).getByText("손익비 부족")).toBeInTheDocument();
    expect(within(table).getByText("비용 차감 손익비 0.92 < 1.5")).toBeInTheDocument();
    expect(within(table).getByText("90점")).toBeInTheDocument();
    expect(within(table).getByText("손익비 1.05")).toBeInTheDocument();
    // 자세히: 점수 항목·무효 조건
    await user.click(within(table).getAllByRole("button", { name: "자세히" })[0]);
    expect(within(table).getByText("수급 (외국인·기관)")).toBeInTheDocument();
    expect(within(table).getByText("사용 안 함 — VIX 데이터 없음·지연")).toBeInTheDocument();
    expect(within(table).getByText(/VWAP 하회 · 거래량 감소/)).toBeInTheDocument();
    await user.click(within(table).getAllByRole("button", { name: "자세히" })[0]);
    expect(within(table).getByText(/짧은 이동평균 70,120.0 · 긴 이동평균 70,050.5/)).toBeInTheDocument();

    // 신호 성과: 전략·신호 카드, 기간별
    const perf = screen.getByRole("region", { name: "신호 성과" });
    expect(within(perf).getByText("장중 점수")).toBeInTheDocument();
    expect(within(perf).getByText("5분 뒤")).toBeInTheDocument();
    expect(within(perf).getByText("+0.12%")).toBeInTheDocument();
    expect(within(perf).getByText("75%")).toBeInTheDocument();
    expect(within(perf).getByText("평가 4건 · 대기 1건")).toBeInTheDocument();
  });

  it("reviews a settings change and sends only the changed keys after 2FA", async () => {
    let body: { values: Record<string, string | null> } | null = null;
    server.use(
      http.put("/api/trader/control/settings", async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ version: 3, values: {} });
      })
    );
    const { user } = renderDashboard({ stepUpUntil: "2099-01-01T00:00:00.000Z" });
    await openTab(user, "설정");
    const input = await screen.findByLabelText("슬리피지");
    expect(input).toHaveValue("5");
    expect(screen.getByLabelText("최소 손익비")).toHaveValue("1.2");
    expect(screen.getByText(/운영 설정은 DB 에 저장됩니다/)).toHaveTextContent("마지막 저장 v2 · web:owner");
    await user.clear(input);
    await user.type(input, "7");
    // 장마감 청산을 끄고, 진입 마감을 14:30 으로
    await user.clear(screen.getByLabelText("장마감 청산"));
    const cutoff = screen.getByLabelText("신규 매수 마감");
    expect(cutoff).toHaveValue("15:00");
    await user.clear(cutoff);
    await user.type(cutoff, "14:30");
    await user.click(screen.getByRole("button", { name: "변경 검토" }));
    const dialog = screen.getByRole("dialog", { name: "설정 변경 검토" });
    expect(within(dialog).getByText("슬리피지")).toBeInTheDocument();
    expect(within(dialog).getByText("끔")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "적용" }));
    await vi.waitFor(() => expect(body).not.toBeNull());
    expect(body!.values).toEqual({ slippage_bps: "7", entry_cutoff: "14:30:00", eod_exit: null });
    expect(await screen.findByText(/v3 저장됨/)).toBeInTheDocument();
  });

  it("edits symbol selection and the open-position cap (blank = no limit)", async () => {
    let body: { values: Record<string, string | null> } | null = null;
    server.use(
      http.put("/api/trader/control/settings", async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ version: 3, values: {} });
      })
    );
    const { user } = renderDashboard({ stepUpUntil: "2099-01-01T00:00:00.000Z" });
    await openTab(user, "설정");
    expect(await screen.findByLabelText("선정 방식")).toHaveValue("auto");
    expect(screen.getByText(/저장된 값 3개 · 엔진 적용 3개/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("선정 방식"), "fixed");
    const max = screen.getByLabelText("최대 종목 수");
    await user.clear(max);
    await user.type(max, "05");
    const pinned = screen.getByLabelText("항상 포함 종목");
    await user.clear(pinned);
    await user.type(pinned, "005930, 000660");
    await user.clear(screen.getByLabelText("동시 보유 종목 수"));
    await user.click(screen.getByRole("button", { name: "변경 검토" }));
    const dialog = screen.getByRole("dialog", { name: "설정 변경 검토" });
    expect(within(dialog).getByText("제한 없음")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "적용" }));
    await vi.waitFor(() => expect(body).not.toBeNull());
    expect(body!.values).toEqual({
      universe_mode: "fixed",
      universe_max_symbols: "5",
      universe_pinned: "005930,000660",
      risk_max_open_positions: null,
    });
  });

  it("rejects malformed symbol codes in the pinned list", async () => {
    const { user } = renderDashboard({ stepUpUntil: "2099-01-01T00:00:00.000Z" });
    await openTab(user, "설정");
    const pinned = await screen.findByLabelText("항상 포함 종목");
    await user.clear(pinned);
    await user.type(pinned, "0059;30");
    expect(screen.getByText("형식이 맞지 않는 값이 있습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "변경 검토" })).toBeDisabled();
  });

  it("blocks a malformed time and reverts to the previous version after 2FA", async () => {
    let reverted = false;
    server.use(
      http.post("/api/trader/control/settings/revert", () => {
        reverted = true;
        return HttpResponse.json({ version: 3, restored: 1, values: {} });
      })
    );
    const { user } = renderDashboard({ stepUpUntil: "2099-01-01T00:00:00.000Z" });
    await openTab(user, "설정");
    const cutoff = await screen.findByLabelText("신규 매수 마감");
    await user.clear(cutoff);
    await user.type(cutoff, "3pm");
    expect(screen.getByText("형식이 맞지 않는 값이 있습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "변경 검토" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "직전 설정으로 되돌리기" }));
    const dialog = screen.getByRole("dialog", { name: "직전 설정으로 되돌리기" });
    expect(dialog).toHaveTextContent("v2 대신 v1");
    await user.click(within(dialog).getByRole("button", { name: "되돌리기" }));
    await vi.waitFor(() => expect(reverted).toBe(true));
    expect(await screen.findByText(/v1 값으로 되돌려 v3 저장됨/)).toBeInTheDocument();
  });

  it("explains that settings cannot be saved until the engine moved them to the DB", async () => {
    server.use(
      http.get("/api/trader/status", () =>
        HttpResponse.json({
          ...mockTraderStatus,
          settings: { ...mockTraderStatus.settings, ready: false, savedVersion: 0, previousVersion: null, envIgnored: [] },
        })
      )
    );
    const { user } = renderDashboard({ stepUpUntil: "2099-01-01T00:00:00.000Z" });
    await openTab(user, "설정");
    expect(await screen.findByText(/아직 운영 설정을 DB 로 옮기지 않았습니다/)).toBeInTheDocument();
    expect(screen.getByLabelText("슬리피지")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "직전 설정으로 되돌리기" })).not.toBeInTheDocument();
  });

  it("lists trader.env values that are ignored", async () => {
    server.use(
      http.get("/api/trader/status", () =>
        HttpResponse.json({ ...mockTraderStatus, settings: { ...mockTraderStatus.settings, envIgnored: ["slippage_bps", "eod_exit"] } })
      )
    );
    const { user } = renderDashboard();
    await openTab(user, "설정");
    expect(await screen.findByText(/쓰이지 않는 값: 슬리피지, 장마감 청산/)).toBeInTheDocument();
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
