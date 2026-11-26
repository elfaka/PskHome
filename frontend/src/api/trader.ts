import { api } from "./client";

/** 자동매매(/trader) 본인 전용 로그인. 백엔드 `modules/trader` 와 계약이 묶여 있다. */
export type TraderMe =
  | { authenticated: false }
  | { authenticated: true; username: string };

export async function getTraderMe(): Promise<TraderMe> {
  const res = await api.get<TraderMe>("/api/trader/auth/me");
  return res.data;
}

export async function traderLogin(username: string, password: string): Promise<TraderMe> {
  const res = await api.post<TraderMe>("/api/trader/auth/login", { username, password });
  return res.data;
}

export async function traderLogout(): Promise<void> {
  await api.post("/api/trader/auth/logout");
}
