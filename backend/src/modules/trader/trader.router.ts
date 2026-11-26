import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";

import { env } from "../../config/env.js";
import { HttpError } from "../../lib/httpError.js";
import { LoginThrottle, verifyLogin } from "./traderAuth.service.js";
import * as dashboard from "./traderDashboard.service.js";

/**
 * 자동매매(/trader) 비공개 영역.
 *
 * 공개: POST /api/trader/auth/login, POST /api/trader/auth/logout, GET /api/trader/auth/me
 * 인증 필요(trader 로그인): 그 외 /api/trader/** — Google 로그인과는 별개다.
 *
 * 세션은 기존 express-session 쿠키를 같이 쓰되 `session.trader` 키에만 둔다.
 * 로그인할 때 세션 ID 를 새로 발급한다 (세션 고정 공격 방지). Google 로그인 정보는 옮겨 담는다.
 */

const LoginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

const LOGIN_FAILED = "아이디 또는 비밀번호가 올바르지 않습니다.";

function idleMs() {
  return env.TRADER_SESSION_IDLE_MINUTES * 60_000;
}

function maxMs() {
  return env.TRADER_SESSION_MAX_HOURS * 3_600_000;
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

export const requireTraderAuth: RequestHandler = (req, _res, next) => {
  const t = activeTrader(req);
  if (!t) {
    next(HttpError.unauthorized("Trader login is required."));
    return;
  }
  t.lastSeenAt = Date.now();
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

export function createTraderRouter(throttle = new LoginThrottle()): Router {
  const router = Router();

  // 이 영역의 응답은 캐시·검색 노출 금지
  router.use("/trader", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    next();
  });

  router.post("/trader/auth/login", async (req, res) => {
    const ip = req.ip ?? "unknown";
    const locked = throttle.lockedFor(ip);
    if (locked > 0) {
      res.setHeader("Retry-After", String(Math.ceil(locked / 1000)));
      throw new HttpError(
        429,
        "TOO_MANY_ATTEMPTS",
        "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요."
      );
    }

    const body = LoginBody.safeParse(req.body);
    const ok =
      body.success &&
      (await verifyLogin(
        {
          username: env.TRADER_ADMIN_USERNAME,
          passwordHash: env.TRADER_ADMIN_PASSWORD_HASH,
        },
        body.data.username,
        body.data.password
      ));

    if (!ok) {
      throttle.fail(ip);
      throw HttpError.unauthorized(LOGIN_FAILED, "LOGIN_FAILED");
    }

    throttle.succeed(ip);
    const passportData = req.session.passport;
    await regenerate(req);
    if (passportData) req.session.passport = passportData;
    const now = Date.now();
    req.session.trader = { username: body.data.username, loginAt: now, lastSeenAt: now };
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
    if (!t) {
      res.json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, username: t.username });
  });

  // --- 여기부터 trader 로그인 필요 ---
  router.use("/trader", requireTraderAuth);

  router.get("/trader/ping", (_req, res) => {
    res.json({ ok: true });
  });

  // --- 대시보드 (엔진 DB 읽기 전용) ---
  const account = () => env.TRADER_ACCOUNT_NAME;

  router.get("/trader/summary", async (_req, res) => {
    res.json(await dashboard.getSummary(account()));
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

  return router;
}
