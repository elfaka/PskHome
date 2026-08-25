import { Router } from "express";

import { HttpError } from "../../lib/httpError.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import * as analyzeService from "./analyze.service.js";
import * as formsService from "./forms.service.js";
import { clampPageSize } from "./survey.types.js";

/**
 * Google Forms 조회/분석 — 기존 `survey/controller/FormsController.java` + `AnalyzeController.java`
 *
 * `/api/forms/**` 는 전부 인증이 필요하다.
 * 로그인 사용자의 access token 으로만 Google API 를 호출하므로
 * 본인 계정의 설문에만 접근된다.
 */
export const formsRouter: Router = Router();

formsRouter.use("/forms", requireAuth);

function parseLimit(raw: unknown, fallback: number): number {
  if (raw == null) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw HttpError.badRequest(`Invalid limit: ${String(raw)}`, "INVALID_PARAM");
  }

  return value;
}

// 설문 목록
formsRouter.get("/forms", async (req, res) => {
  res.json(await formsService.listMyForms(req.user!));
});

// 설문 상세 (문항 정규화 결과)
formsRouter.get("/forms/:formId", async (req, res) => {
  res.json(await formsService.getFormDetail(req.user!, req.params.formId));
});

// 설문 응답 목록 (페이지네이션)
formsRouter.get("/forms/:formId/responses", async (req, res) => {
  const pageSize = clampPageSize(parseLimit(req.query.limit, 50));
  const pageToken =
    typeof req.query.pageToken === "string" ? req.query.pageToken : null;

  res.json(
    await formsService.listResponses(
      req.user!,
      req.params.formId,
      pageSize,
      pageToken
    )
  );
});

// 설문 응답 분석
formsRouter.get("/forms/:formId/analyze", async (req, res) => {
  const limit = parseLimit(req.query.limit, 200);

  res.json(await analyzeService.analyze(req.user!, req.params.formId, limit));
});
