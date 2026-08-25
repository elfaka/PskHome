import { Router } from "express";

/**
 * 헬스체크 — 기존 `survey/controller/PingController.java`
 *
 * 배포 환경에서 reverse proxy / 인증 설정 / 서버 기동 상태를 빠르게 검증하기 위해
 * 인증이 필요 없는 엔드포인트로 분리해 둔다.
 */
export const pingRouter: Router = Router();

pingRouter.get("/ping", (_req, res) => {
  res.json({ ok: true });
});
