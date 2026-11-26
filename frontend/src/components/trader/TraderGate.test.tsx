import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { server } from "@/test/mocks/server";

import TraderGate from "./TraderGate";

describe("TraderGate", () => {
  it("shows only the login form when not logged in", async () => {
    render(<TraderGate />);
    expect(await screen.findByRole("form", { name: "로그인" })).toBeInTheDocument();
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

  it("logs in, shows the placeholder, and logs out", async () => {
    let sent: unknown = null;
    server.use(
      http.post("/api/trader/auth/login", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ authenticated: true, username: "owner" });
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

  it("goes straight to the placeholder when the session is still valid", async () => {
    server.use(
      http.get("/api/trader/auth/me", () => HttpResponse.json({ authenticated: true, username: "owner" }))
    );
    render(<TraderGate />);
    expect(await screen.findByRole("heading", { name: "자동매매" })).toBeInTheDocument();
  });
});
