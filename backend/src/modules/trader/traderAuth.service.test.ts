import { describe, expect, it } from "vitest";

import {
  describeTraderAuthConfig,
  hashPassword,
  LoginThrottle,
  verifyLogin,
} from "./traderAuth.service.js";

describe("trader password hashing", () => {
  it("hashes with scrypt and verifies only the right username + password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt:16384:8:1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(hash).not.toContain("$");
    expect(hash).not.toContain("correct horse");

    const creds = { username: "owner", passwordHash: hash };
    expect(await verifyLogin(creds, "owner", "correct horse battery")).toBe(true);
    expect(await verifyLogin(creds, "owner", "wrong password!!")).toBe(false);
    expect(await verifyLogin(creds, "other", "correct horse battery")).toBe(false);
  });

  it("uses a fresh salt every time", async () => {
    const a = await hashPassword("same password 123");
    const b = await hashPassword("same password 123");
    expect(a).not.toBe(b);
  });

  it("rejects short passwords when hashing", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
  });

  it("always fails when the account is not configured or the hash is malformed", async () => {
    expect(await verifyLogin({}, "", "")).toBe(false);
    expect(await verifyLogin({ username: "owner" }, "owner", "x")).toBe(false);
    expect(await verifyLogin({ username: "owner", passwordHash: "plain-text" }, "owner", "plain-text")).toBe(false);
  });
});

describe("LoginThrottle", () => {
  it("locks an IP after 5 failures within the window and unlocks after it", () => {
    let t = 0;
    const th = new LoginThrottle(undefined, () => t);
    for (let i = 0; i < 4; i++) th.fail("1.1.1.1");
    expect(th.lockedFor("1.1.1.1")).toBe(0);
    th.fail("1.1.1.1");
    expect(th.lockedFor("1.1.1.1")).toBeGreaterThan(0);
    expect(th.lockedFor("2.2.2.2")).toBe(0);
    t = 15 * 60_000;
    expect(th.lockedFor("1.1.1.1")).toBe(0);
  });

  it("locks everyone after 20 failures in total (spoofed IPs)", () => {
    const th = new LoginThrottle(undefined, () => 0);
    for (let i = 0; i < 20; i++) th.fail(`10.0.0.${i}`);
    expect(th.lockedFor("203.0.113.9")).toBeGreaterThan(0);
  });

  it("clears the per-IP counter on success", () => {
    const th = new LoginThrottle(undefined, () => 0);
    for (let i = 0; i < 4; i++) th.fail("1.1.1.1");
    th.succeed("1.1.1.1");
    th.fail("1.1.1.1");
    expect(th.lockedFor("1.1.1.1")).toBe(0);
  });
});

describe("describeTraderAuthConfig", () => {
  it("reports configured without leaking values", async () => {
    const hash = await hashPassword("correct-horse-battery");
    const msg = describeTraderAuthConfig({ username: "admin", passwordHash: hash });
    expect(msg).toBe("[trader] login configured");
  });

  it("names what is missing or broken", async () => {
    expect(describeTraderAuthConfig({})).toContain("TRADER_ADMIN_USERNAME 없음");
    expect(describeTraderAuthConfig({})).toContain("TRADER_ADMIN_PASSWORD_HASH 없음");
    const hash = await hashPassword("correct-horse-battery");
    const cut = hash.split(":").slice(0, 5).join(":");
    const msg = describeTraderAuthConfig({ username: " admin", passwordHash: cut });
    expect(msg).toContain("앞뒤에 공백");
    expect(msg).toContain("5칸");
    expect(msg).not.toContain(cut);
  });
});
