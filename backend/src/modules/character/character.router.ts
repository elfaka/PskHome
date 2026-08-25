import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import * as characterService from "./character.service.js";

/**
 * LostArk 캐릭터 조회 — 기존 `character/controller/LostArkController.java`
 *
 * 기존 SecurityConfig 의 permitAll 목록에 없던 경로이므로 인증이 필요하다.
 */
export const characterRouter: Router = Router();

characterRouter.use("/character", requireAuth);

characterRouter.get("/character/:characterName", async (req, res) => {
  res.json(await characterService.getCharacterInfo(req.params.characterName));
});
