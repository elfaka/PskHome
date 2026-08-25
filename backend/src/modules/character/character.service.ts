import axios from "axios";

import { HttpError } from "../../lib/httpError.js";
import type { ArmoryTotal } from "./character.types.js";
import { getLostArkClient } from "./lostArkClient.js";

/**
 * LostArk 캐릭터 정보 조회 — 기존 `character/service/LostArkService.java`
 *
 * 외부 응답을 가공하지 않고 그대로 전달한다.
 */
export async function getCharacterInfo(
  characterName: string
): Promise<ArmoryTotal> {
  try {
    const { data } = await getLostArkClient().get<ArmoryTotal>(
      `/armories/characters/${encodeURIComponent(characterName)}`
    );

    return data;
  } catch (e) {
    if (e instanceof HttpError) throw e;

    // 외부 API 의 상태코드를 살려 전달한다.
    // (레이트 리밋 429, 없는 캐릭터 404 등은 서버 장애가 아니다)
    if (axios.isAxiosError(e) && e.response) {
      throw new HttpError(
        e.response.status,
        `LOSTARK_${e.response.status}`,
        `LostArk API request failed: ${e.message}`
      );
    }

    throw HttpError.internal(
      `LostArk API request failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
