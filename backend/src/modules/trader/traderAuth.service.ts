import {
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

/**
 * 자동매매(/trader) 전용 로그인 — 본인 계정 하나만 존재한다.
 *
 * [비밀번호 저장]
 * 평문은 어디에도 두지 않는다. `.env` 에는 scrypt 해시만 둔다.
 *   형식: scrypt:<N>:<r>:<p>:<salt base64>:<hash base64>
 * (`import {
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

/**
 * 자동매매(/trader) 전용 로그인 — 본인 계정 하나만 존재한다.
 *
 * [비밀번호 저장]
 * 평문은 어디에도 두지 않는다. `.env` 에는 scrypt 해시만 둔다.
 를 쓰지 않는다 — docker compose 의 .env 가 `import {
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

/**
 * 자동매매(/trader) 전용 로그인 — 본인 계정 하나만 존재한다.
 *
 * [비밀번호 저장]
 * 평문은 어디에도 두지 않는다. `.env` 에는 scrypt 해시만 둔다.
 를 변수로 치환한다)
 * 해시는 `npm run trader:hash-password` 로 만든다 (표준입력으로 비밀번호를 받는다).
 *
 * [무차별 대입 방어]
 * - IP 별: 15분 안에 5번 실패하면 그 IP 를 15분 잠근다
 * - 전체: 15분 안에 20번 실패하면 모든 로그인 시도를 15분 잠근다
 *   (`trust proxy` 때문에 X-Forwarded-For 위조로 IP 제한은 피할 수 있으므로 전체 제한이 최후 방어선)
 */

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LEN = 64;

function scrypt(
  password: string,
  salt: Buffer,
  keyLen: number,
  opts: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keyLen, opts, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error("비밀번호는 12자 이상이어야 한다");
  }
  const salt = randomBytes(16);
  const { N, r, p } = SCRYPT_PARAMS;
  const key = await scrypt(password, salt, KEY_LEN, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join(":");
}

type ParsedHash = { N: number; r: number; p: number; salt: Buffer; key: Buffer };

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.trim().split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return null;
  const salt = Buffer.from(parts[4], "base64");
  const key = Buffer.from(parts[5], "base64");
  if (salt.length < 16 || key.length < 32) return null;
  return { N, r, p, salt, key };
}

// 설정이 없거나 깨졌을 때도 같은 시간만큼 계산해 응답 시간으로 계정 존재를 추측하지 못하게 한다
const DUMMY: ParsedHash = {
  ...SCRYPT_PARAMS,
  salt: Buffer.alloc(16, 1),
  key: Buffer.alloc(KEY_LEN, 0),
};

function sameText(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export type TraderCredentials = {
  username?: string;
  passwordHash?: string;
};

/** 계정이 설정돼 있고 아이디·비밀번호가 모두 맞을 때만 true. */
export async function verifyLogin(
  creds: TraderCredentials,
  username: string,
  password: string
): Promise<boolean> {
  const parsed = creds.passwordHash ? parseHash(creds.passwordHash) : null;
  const target = parsed ?? DUMMY;
  const key = await scrypt(password, target.salt, target.key.length, {
    N: target.N,
    r: target.r,
    p: target.p,
    maxmem: 64 * 1024 * 1024,
  });
  const passwordOk = timingSafeEqual(key, target.key);
  const userOk = sameText(username, creds.username ?? "");
  return Boolean(parsed && creds.username) && userOk && passwordOk;
}

type Window = { count: number; since: number };

export class LoginThrottle {
  private readonly perIp = new Map<string, Window>();
  private global: Window = { count: 0, since: 0 };

  constructor(
    private readonly opts = { windowMs: 15 * 60_000, maxPerIp: 5, maxGlobal: 20 },
    private readonly now: () => number = Date.now
  ) {}

  private fresh(w: Window | undefined, t: number): Window {
    return !w || t - w.since >= this.opts.windowMs ? { count: 0, since: t } : w;
  }

  /** 잠겨 있으면 남은 시간(ms), 아니면 0. */
  lockedFor(ip: string): number {
    const t = this.now();
    const g = this.fresh(this.global, t);
    if (g.count >= this.opts.maxGlobal) return g.since + this.opts.windowMs - t;
    const w = this.fresh(this.perIp.get(ip), t);
    if (w.count >= this.opts.maxPerIp) return w.since + this.opts.windowMs - t;
    return 0;
  }

  fail(ip: string): void {
    const t = this.now();
    this.global = this.fresh(this.global, t);
    this.global.count += 1;
    const w = this.fresh(this.perIp.get(ip), t);
    w.count += 1;
    this.perIp.set(ip, w);
    if (this.perIp.size > 1000) {
      for (const [k, v] of this.perIp) {
        if (t - v.since >= this.opts.windowMs) this.perIp.delete(k);
      }
    }
  }

  succeed(ip: string): void {
    this.perIp.delete(ip);
  }
}
