import { describe, expect, it } from "vitest";

import { base32Decode, base32Encode, generateSecret, hotp, otpauthUri, parseSecret, stepAt, verifyTotp } from "./totp.js";

// RFC 6238 부록 B 의 SHA1 시험값 (비밀키 "12345678901234567890"), 6자리로 자른 값
const RFC_KEY = Buffer.from("12345678901234567890");
const RFC_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp", () => {
  it("base32 round-trips and matches the RFC secret", () => {
    expect(base32Encode(RFC_KEY)).toBe(RFC_B32);
    expect(base32Decode(RFC_B32)?.equals(RFC_KEY)).toBe(true);
    expect(base32Decode("gezd gnbv-gy3t qojq gezd gnbv gy3t qojq====")?.equals(RFC_KEY)).toBe(true);
    expect(base32Decode("not base32!")).toBeNull();
  });

  it("matches RFC 6238 test vectors", () => {
    expect(hotp(RFC_KEY, stepAt(59_000))).toBe("287082");
    expect(hotp(RFC_KEY, stepAt(1_111_111_109_000))).toBe("081804");
    expect(hotp(RFC_KEY, stepAt(1_234_567_890_000))).toBe("005924");
    expect(hotp(RFC_KEY, stepAt(2_000_000_000_000))).toBe("279037");
  });

  it("accepts ±1 step of clock drift and rejects further", () => {
    const t = 1_234_567_890_000;
    const now = stepAt(t);
    expect(verifyTotp(RFC_KEY, hotp(RFC_KEY, now), t)).toBe(now);
    expect(verifyTotp(RFC_KEY, hotp(RFC_KEY, now - 1), t)).toBe(now - 1);
    expect(verifyTotp(RFC_KEY, hotp(RFC_KEY, now + 1), t)).toBe(now + 1);
    expect(verifyTotp(RFC_KEY, hotp(RFC_KEY, now - 2), t)).toBeNull();
  });

  it("rejects a code whose step was already used (replay)", () => {
    const t = 1_234_567_890_000;
    const now = stepAt(t);
    const code = hotp(RFC_KEY, now);
    expect(verifyTotp(RFC_KEY, code, t, now)).toBeNull();
    expect(verifyTotp(RFC_KEY, code, t, now - 1)).toBe(now);
  });

  it("rejects malformed codes", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12 345"]) {
      expect(verifyTotp(RFC_KEY, bad, 0)).toBeNull();
    }
  });

  it("generates 160-bit secrets and refuses short ones", () => {
    const s = generateSecret();
    expect(parseSecret(s)?.length).toBe(20);
    expect(parseSecret("ABCDEFGH")).toBeNull(); // 40비트
    expect(parseSecret(undefined)).toBeNull();
    expect(otpauthUri(s, "owner")).toMatch(/^otpauth:\/\/totp\/PskHome%20Trader%3Aowner\?secret=/);
  });
});
