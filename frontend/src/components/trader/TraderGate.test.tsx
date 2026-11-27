import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { server } from "@/test/mocks/server";

import TraderGate from "./TraderGate";

// canvas 차트는 jsdom 에서 그릴 수 없다 — 받은 데이터만 보여주는 가짜로 바꾼다
vi.mock("./TraderCandleChart", () => ({
  default: ({ data }: { data: { symbol: string; interval: number; bars: unknown[]; fills: unknown[] } }) => (
    <div data-testid="trader-candle-chart">
      {data.symbol}:{data.interval}:{data.bars.length}:{data.fills.length}
    </div>
  ),
}));

describe("TraderGate", () => {
  it("shows only the login form when not logged in", async () => {
    render(<TraderGate />);
    expect(await screen.findByRole("form", { name: "로그인" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/인증 코드/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "자동매매" })).not.toBeInTheDocument();
  });

  it("shows the backend error and clears the password on a failed login", async () => {
    const user = userEvent.setup();
    render(<TraderGate />);
    await user.type(await screen.findByLabelText("아이디"), "owner");
    await user.type(screen.getByLabelText("비밀번호"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("아이디 또는 비밀번호가 올바르지 않습니다.");
    expect(screen.getByLabelText("비밀번호")).toHaveValue("");
    expect(screen.queryByRole("heading", { name: "자동매매" })).not.toBeInTheDocument();
  });

  it("asks for the authenticator code when 2FA is on and sends it", async () => {
    let loggedIn = false;
    let sent: unknown = null;
    server.use(
      http.get("/api/trader/auth/me", () =>
        HttpResponse.json(
          loggedIn
            ? { authenticated: true, username: "owner", totpEnabled: true, stepUpUntil: "2099-01-01T00:00:00.000Z" }
            : { authenticated: false, totpRequired: true }
        )
      ),
      http.post("/api/trader/auth/login", async ({ request }) => {
        sent = await request.json();
        loggedIn = true;
        return HttpResponse.json({ authenticated: true, username: "owner" });
      })
    );
    const user = userEvent.setup();
    render(<TraderGate />);
    await user.type(await screen.findByLabelText("아이디"), "owner");
    await user.type(screen.getByLabelText("비밀번호"), "right-password");
    await user.type(screen.getByLabelText(/인증 코드/), "12a3456");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByRole("heading", { name: "자동매매" })).toBeInTheDocument();
    expect(sent).toEqual({ username: "owner", password: "right-password", code: "123456" });
  });

  it("logs in without a code when 2FA is off, and logs out", async () => {
    let loggedIn = false;
    let sent: unknown = null;
    server.use(
      http.get("/api/trader/auth/me", () =>
        HttpResponse.json(loggedIn ? { authenticated: true, username: "owner", totpEnabled: false, stepUpUntil: null } : { authenticated: false, totpRequired: false })
      ),
      http.post("/api/trader/auth/login", async ({ request }) => {
        sent = await request.json();
        loggedIn = true;
        return HttpResponse.json({ authenticated: true, username: "owner" });
      }),
      http.post("/api/trader/auth/logout", () => {
        loggedIn = false;
        return HttpResponse.json({ ok: true });
      })
    );
    const user = userEvent.setup();
    render(<TraderGate />);
    await user.type(await screen.findByLabelText("아이디"), "owner");
    await user.type(screen.getByLabelText("비밀번호"), "right-password");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByRole("heading", { name: "자동매매" })).toBeInTheDocument();
    expect(sent).toEqual({ username: "owner", password: "right-password" });

    await user.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(await screen.findByRole("form", { name: "로그인" })).toBeInTheDocument();
  });

  it("goes straight to the dashboard when the session is still valid", async () => {
    server.use(
      http.get("/api/trader/auth/me", () => HttpResponse.json({ authenticated: true, username: "owner", totpEnabled: true, stepUpUntil: null }))
    );
    render(<TraderGate />);
    expect(await screen.findByRole("heading", { name: "자동매매" })).toBeInTheDocument();
  });
});
