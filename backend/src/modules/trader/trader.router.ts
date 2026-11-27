import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";

import { env } from "../../config/env.js";
import { HttpError } from "../../lib/httpError.js";
import { LoginThrottle, verifyLogin } from "./traderAuth.service.js";
import * as charts from "./traderCharts.service.js";
import * as control from "./traderControl.service.js";
import * as dashboard from "./traderDashboard.service.js";
import * as status from "./traderStatus.service.js";
import { parseSecret, verifyTotp } from "./totp.js";

/**
 * 자동매매(/trader) 비공개 영역.
 *
 * 공개: POST /api/trader/auth/login, POST /api/trader/auth/logout, GET /api/trader/auth/me
 * 인증 필요(trader 로그인): 그 외 /api/trader/** — Google 로그인과는 별개다.
 *
 * 세션은 기존 express-session 쿠키를 같이 쓰되 `session.trader` 키에만 둔다.
 * 로그인할 때 세션 ID 를 새로 발급한다 (세션 고정 공격 방지). Google 로그인 정보는 옮겨 담는다.
 *
 * [2단계 인증 (TRADER_TOTP_SECRET)]
 * - 설정돼 있으면 로그인에 6자리 코드가 필요하다 (실패 메시지는 비밀번호 오류와 같다)
 * - 위험이 커지는 조작(재개·전략 켜기·설정 변경)은 코드 확인 후 5분 안에만 된다 (로그인 직후 포함)
 * - 위험을 줄이는 조작(긴급 정지·전략 끄기)은 코드 없이 된다
 * - 비밀키가 없으면 위험이 커지는 조작은 403 TOTP_NOT_CONFIGURED
 *
 * [조작 API] POST/PUT /api/trader/control/** 와 step-up 은 같은 출처(Origin)의 JSON 요청만 받는다 (CSRF).
 */

const LoginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
  code: z.string().max(16).optional(),
});

const CodeBody = z.object({ code: z.string().min(1).max(16) });
const HaltBody = z.object({ reason: z.string().max(200).default("") });
const ResumeBody = z.object({ note: z.string().max(200).default("") });
const StrategyBody = z.object({ enabled: z.boolean() });
const SettingsBody = z.object({ values: z.record(z.string(), z.union([z.string(), z.null()])) });

const LOGIN_FAILED = "아이디 또는 비밀번호가 올바르지 않습니다.";
export const STEP_UP_MS = 5 * 60_000;

function idleMs() {
  return env.TRADER_SESSION_IDLE_MINUTES * 60_000;
}

function maxMs() {
  return env.TRADER_SESSION_MAX_HOURS * 3_600_000;
}

function totpKey(): Buffer | null {
  return parseSecret(env.TRADER_TOTP_SECRET);
}

/** 로그인 상태면 세션 값을, 만료됐거나 없으면 null. 만료된 값은 지운다. */
function activeTrader(req: Request) {
  const t = req.session?.trader;
  if (!t) return null;
  const now = Date.now();
  if (now - t.loginAt > maxMs() || now - t.lastSeenAt > idleMs()) {
    delete req.session.trader;
    return null;
  }
  return t;
}

function stepUpUntil(req: Request): number | null {
  const at = req.session?.trader?.stepUpAt;
  if (!at || !totpKey()) return null;
  const until = at + STEP_UP_MS;
  return until > Date.now() ? until : null;
}

export const requireTraderAuth: RequestHandler = (req, _res, next) => {
  const t = activeTrader(req);
  if (!t) {
    next(HttpError.unauthorized("Trader login is required."));
    return;
  }
  t.lastSeenAt = Date.now();
  next();
};

/** 위험이 커지는 조작: 2단계 인증 후 5분 안이어야 한다. */
export const requireStepUp: RequestHandler = (req, _res, next) => {
  if (!totpKey()) {
    next(
      new HttpError(
        403,
        "TOTP_NOT_CONFIGURED",
        "2단계 인증(TRADER_TOTP_SECRET)이 설정되지 않아 이 조작을 할 수 없습니다. 긴급 정지·끄기는 가능합니다."
      )
    );
    return;
  }
  if (!stepUpUntil(req)) {
    next(new HttpError(403, "STEP_UP_REQUIRED", "인증 앱의 6자리 코드를 입력해야 합니다."));
    return;
  }
  next();
};

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** 프록시가 넘긴 첫 번째 값 ("a, b" → "a") */
function firstHeader(req: Request, name: string): string | null {
  const v = req.get(name);
  return v ? v.split(",")[0]!.trim() || null : null;
}

/**
 * 이 앱의 출처로 인정하는 값.
 * - 요청이 도착한 주소 (Host 와, 프록시가 Host 를 바꿨을 때를 위한 X-Forwarded-Host)
 * - 설정된 공개 주소: GOOGLE_CALLBACK_URL(운영 https://elfaka.kr), APP_LOGIN_SUCCESS_REDIRECT(개발 http://localhost:5173)
 *   운영은 Cloudflare → traefik 을 거치며 Host·프로토콜이 바뀔 수 있어, 공개 주소를 기준으로도 맞춘다.
 */
export function allowedOrigins(req: Request): Set<string> {
  const hosts = [req.get("host"), firstHeader(req, "x-forwarded-host")].filter((h): h is string => !!h);
  return new Set(
    [
      ...hosts.map((h) => `${req.protocol}://${h}`),
      originOf(env.GOOGLE_CALLBACK_URL),
      originOf(env.APP_LOGIN_SUCCESS_REDIRECT),
    ].filter((o): o is string => !!o)
  );
}

/** 같은 출처의 JSON 요청만 받는다 (CSRF). 브라우저는 POST·PUT 에 항상 Origin 을 붙인다. */
export const requireSameOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.get("origin") ?? originOf(req.get("referer"));
  const allowed = allowedOrigins(req);
  const json = Boolean(req.is("application/json"));
  if (!origin || !allowed.has(origin) || !json) {
    // 운영에서 막히면 원인을 docker logs 로 본다 (헤더 값만, 쿠키·본문은 남기지 않는다)
    console.warn(
      "[trader] BAD_ORIGIN",
      JSON.stringify({
        path: req.path,
        origin: origin ?? null,
        allowed: [...allowed],
        host: req.get("host") ?? null,
        forwardedHost: req.get("x-forwarded-host") ?? null,
        forwardedProto: req.get("x-forwarded-proto") ?? null,
        contentType: req.get("content-type") ?? null,
      })
    );
    next(
      new HttpError(
        403,
        "BAD_ORIGIN",
        !json ? "허용되지 않은 요청입니다 (JSON 요청만 받습니다)." : "허용되지 않은 요청입니다 (다른 주소에서 온 요청)."
      )
    );
    return;
  }
  next();
};

function regenerate(req: Request): Promise<void> {
  return new Promise((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve()))
  );
}

function save(req: Request): Promise<void> {
  return new Promise((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve()))
  );
}

function actor(req: Request): string {
  return `web:${req.session.trader?.username ?? "unknown"}`;
}

export function createTraderRouter(throttle = new LoginThrottle()): Router {
  const router = Router();
  // 같은 코드를 두 번 쓰지 못하게 마지막으로 받은 스텝 (계정이 하나라 프로세스에 하나)
  const totp = { lastStep: -1 };

  /** 코드가 맞으면 true. 맞은 스텝은 다시 쓸 수 없다. */
  const checkCode = (code: string | undefined): boolean => {
    const key = totpKey();
    if (!key || !code) return false;
    const step = verifyTotp(key, code.replace(/\s/g, ""), Date.now(), totp.lastStep);
    if (step === null) return false;
    totp.lastStep = step;
    return true;
  };

  const ensureNotLocked = (req: Request, res: import("express").Response) => {
    const locked = throttle.lockedFor(req.ip ?? "unknown");
    if (locked > 0) {
      res.setHeader("Retry-After", String(Math.ceil(locked / 1000)));
      throw new HttpError(429, "TOO_MANY_ATTEMPTS", "시도가 너무 많습니다. 잠시 후 다시 시도하세요.");
    }
  };

  // 이 영역의 응답은 캐시·검색 노출 금지
  router.use("/trader", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    next();
  });

  router.post("/trader/auth/login", async (req, res) => {
    const ip = req.ip ?? "unknown";
    ensureNotLocked(req, res);

    const body = LoginBody.safeParse(req.body);
    const passwordOk =
      body.success &&
      (await verifyLogin(
        {
          username: env.TRADER_ADMIN_USERNAME,
          passwordHash: env.TRADER_ADMIN_PASSWORD_HASH,
        },
        body.data.username,
        body.data.password
      ));
    // 비밀번호가 맞을 때만 코드를 소모한다 (남이 코드를 미리 써 버리지 못하게)
    const totpOn = totpKey() !== null;
    const codeOk = !totpOn || (passwordOk && checkCode(body.data?.code));

    if (!passwordOk || !codeOk) {
      throttle.fail(ip);
      throw HttpError.unauthorized(LOGIN_FAILED, "LOGIN_FAILED");
    }
    if (!body.success) throw HttpError.unauthorized(LOGIN_FAILED, "LOGIN_FAILED");

    throttle.succeed(ip);
    const passportData = req.session.passport;
    await regenerate(req);
    if (passportData) req.session.passport = passportData;
    const now = Date.now();
    req.session.trader = {
      username: body.data.username,
      loginAt: now,
      lastSeenAt: now,
      ...(totpOn ? { stepUpAt: now } : {}),
    };
    await save(req);
    res.json({ authenticated: true, username: body.data.username });
  });

  router.post("/trader/auth/logout", async (req, res) => {
    if (req.session?.trader) {
      delete req.session.trader;
      await save(req);
    }
    res.json({ ok: true });
  });

  /** 로그인 전에도 호출한다 — 401 을 내지 않는다. */
  router.get("/trader/auth/me", (req, res) => {
    const t = activeTrader(req);
    const totpEnabled = totpKey() !== null;
    if (!t) {
      res.json({ authenticated: false, totpRequired: totpEnabled });
      return;
    }
    const until = stepUpUntil(req);
    res.json({
      authenticated: true,
      username: t.username,
      totpEnabled,
      stepUpUntil: until ? new Date(until).toISOString() : null,
    });
  });

  // --- 여기부터 trader 로그인 필요 ---
  router.use("/trader", requireTraderAuth);

  router.get("/trader/ping", (_req, res) => {
    res.json({ ok: true });
  });

  /** 2단계 인증: 맞으면 5분 동안 위험이 커지는 조작을 할 수 있다. */
  router.post("/trader/auth/step-up", requireSameOrigin, async (req, res) => {
    ensureNotLocked(req, res);
    if (!totpKey()) {
      throw new HttpError(403, "TOTP_NOT_CONFIGURED", "2단계 인증이 설정되지 않았습니다.");
    }
    const body = CodeBody.safeParse(req.body);
    if (!body.success || !checkCode(body.data.code)) {
      throttle.fail(req.ip ?? "unknown");
      throw new HttpError(401, "TOTP_FAILED", "코드가 맞지 않습니다.");
    }
    req.session.trader!.stepUpAt = Date.now();
    await save(req);
    res.json({ stepUpUntil: new Date(Date.now() + STEP_UP_MS).toISOString() });
  });

  // --- 대시보드 (엔진 DB 조회) ---
  const account = () => env.TRADER_ACCOUNT_NAME;

  router.get("/trader/summary", async (_req, res) => {
    res.json(await dashboard.getSummary(account()));
  });

  router.get("/trader/status", async (_req, res) => {
    res.json(await status.getStatus());
  });

  router.get("/trader/equity", async (_req, res) => {
    const summary = await dashboard.getSummary(account());
    res.json(await status.getEquity(account(), summary.equity));
  });

  router.get("/trader/strategies", async (_req, res) => {
    res.json(await status.getStrategies());
  });

  router.get("/trader/activity", async (req, res) => {
    res.json(await status.listActivity(account(), dashboard.clampLimit(req.query.limit, 50)));
  });

  router.get("/trader/orders", async (req, res) => {
    res.json(await dashboard.listOrders(account(), dashboard.clampLimit(req.query.limit)));
  });

  router.get("/trader/fills", async (req, res) => {
    res.json(await dashboard.listFills(account(), dashboard.clampLimit(req.query.limit)));
  });

  router.get("/trader/decisions", async (req, res) => {
    const strategy = typeof req.query.strategy === "string" && /^[a-z_]{1,64}$/.test(req.query.strategy)
      ? req.query.strategy
      : undefined;
    res.json(
      await dashboard.listDecisions(dashboard.clampLimit(req.query.limit), {
        strategy,
        signalsOnly: req.query.signals === "1",
      })
    );
  });

  router.get("/trader/performance", async (_req, res) => {
    res.json(await dashboard.getPerformance());
  });

  router.get("/trader/risk-events", async (req, res) => {
    res.json(await dashboard.listRiskEvents(dashboard.clampLimit(req.query.limit, 30)));
  });

  // --- 그래프·지표 (조회만) ---

  router.get("/trader/chart", async (req, res) => {
    const interval = charts.parseInterval(req.query.interval);
    if (!charts.isSymbol(req.query.symbol) || interval == null) {
      throw new HttpError(400, "BAD_REQUEST", "symbol(영숫자 16자 이하)과 interval(60 또는 300)을 확인하세요.");
    }
    res.json(await charts.getChart(account(), req.query.symbol, interval));
  });

  router.get("/trader/scores", async (req, res) => {
    if (!charts.isSymbol(req.query.symbol)) throw new HttpError(400, "BAD_REQUEST", "symbol(영숫자 16자 이하)을 확인하세요.");
    res.json(await charts.getScores(req.query.symbol));
  });

  router.get("/trader/stats", async (_req, res) => {
    res.json(await charts.getStats(account()));
  });

  // --- 조작 (engine_state 에 쓰고 엔진이 약 5초 안에 반영) ---

  /** 긴급 정지 — 코드 없이 (위험을 줄이는 방향). 엔진이 미체결을 일괄 취소한다. */
  router.post("/trader/control/halt", requireSameOrigin, async (req, res) => {
    const body = HaltBody.safeParse(req.body ?? {});
    await control.halt(body.success ? body.data.reason : "", actor(req));
    res.json({ ok: true });
  });

  router.post("/trader/control/resume", requireSameOrigin, requireStepUp, async (req, res) => {
    const body = ResumeBody.safeParse(req.body ?? {});
    await control.resume(actor(req), body.success ? body.data.note : "");
    res.json({ ok: true });
  });

  router.post("/trader/control/strategies/:id", requireSameOrigin, async (req, res, next) => {
    const body = StrategyBody.safeParse(req.body);
    const id = String(req.params.id);
    if (!body.success || !/^[a-z_]{1,64}$/.test(id)) {
      throw new HttpError(400, "BAD_REQUEST", "잘못된 요청입니다.");
    }
    // 켜기는 위험이 커지는 방향 → 2단계 인증
    if (body.data.enabled) {
      let blocked: unknown;
      requireStepUp(req, res, (e?: unknown) => {
        blocked = e;
      });
      if (blocked) {
        next(blocked);
        return;
      }
    }
    await control.setStrategy(id, body.data.enabled, actor(req));
    res.json({ ok: true });
  });

  router.put("/trader/control/settings", requireSameOrigin, requireStepUp, async (req, res) => {
    const body = SettingsBody.safeParse(req.body);
    if (!body.success) throw new HttpError(400, "BAD_REQUEST", "잘못된 요청입니다.");
    res.json(await control.updateSettings(body.data.values, actor(req)));
  });

  return router;
}
