import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) — Google Authenticator 호환: HMAC-SHA1, 6자리, 30초.
 *
 * - 비밀키는 base32 (RFC 4648, 패딩·공백·대소문자 무시). `.env` 의 TRADER_TOTP_SECRET 에만 둔다
 * - 휴대폰 시계 오차를 앞뒤 1스텝(±30초)까지 허용한다
 * - 같은 스텝의 코드를 두 번 쓰지 못하게 마지막으로 쓴 스텝을 기억한다 (호출한 쪽이 넘겨 준다)
 */

export const STEP_SECONDS = 30;
const DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Buffer | null {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** 새 비밀키 (160비트, RFC 4226 권장 길이). */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** 비밀키로 쓸 수 있는지 (128비트 이상). */
export function parseSecret(secret: string | undefined): Buffer | null {
  if (!secret) return null;
  const key = base32Decode(secret);
  return key && key.length >= 16 ? key : null;
}

export function hotp(key: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return bin.toString().padStart(DIGITS, "0");
}

export function stepAt(nowMs: number): number {
  return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

/**
 * 코드가 맞으면 그 스텝 번호, 아니면 null.
 * lastUsedStep 이하 스텝은 이미 쓴 것으로 보고 받지 않는다 (재사용 방지).
 */
export function verifyTotp(
  key: Buffer,
  code: string,
  nowMs: number,
  lastUsedStep = -1,
  window = 1
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = stepAt(nowMs);
  const given = Buffer.from(code);
  let matched: number | null = null;
  // 시간 차로 어느 스텝이 맞았는지 새지 않게 모든 후보를 다 비교한다
  for (let s = now - window; s <= now + window; s++) {
    const ok = timingSafeEqual(Buffer.from(hotp(key, s)), given);
    if (ok && s > lastUsedStep && matched === null) matched = s;
  }
  return matched;
}

export function otpauthUri(secret: string, account: string, issuer = "PskHome Trader"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}
