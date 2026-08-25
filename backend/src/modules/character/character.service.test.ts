import { describe, it, expect, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";

const holder = vi.hoisted(() => ({ get: null as unknown }));

vi.mock("./lostArkClient.js", async () => {
  const { HttpError } = await import("../../lib/httpError.js");

  return {
    getLostArkClient: () => {
      if (!holder.get) {
        throw new HttpError(
          503,
          "LOSTARK_API_KEY_MISSING",
          "LOSTARK_API_KEY is not configured on this server."
        );
      }
      return { get: holder.get };
    },
    resetLostArkClient: () => {},
  };
});

const { getCharacterInfo } = await import("./character.service.js");

function axiosErrorWithStatus(status: number) {
  return new AxiosError(
    `Request failed with status code ${status}`,
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status,
      statusText: "",
      data: {},
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
    }
  );
}

describe("getCharacterInfo", () => {
  it("passes the upstream payload through untouched", async () => {
    const payload = {
      ArmoryProfile: { CharacterName: "테스트", ItemAvgLevel: "1,700.00" },
      SomeNewFieldFromUpstream: 42,
    };
    holder.get = vi.fn().mockResolvedValue({ data: payload });

    const result = await getCharacterInfo("테스트");

    expect(result).toEqual(payload);
  });

  it("url-encodes the character name", async () => {
    const get = vi.fn().mockResolvedValue({ data: {} });
    holder.get = get;

    await getCharacterInfo("테스트 캐릭터");

    expect(get).toHaveBeenCalledWith(
      `/armories/characters/${encodeURIComponent("테스트 캐릭터")}`
    );
  });

  it("preserves the upstream status code", async () => {
    holder.get = vi.fn().mockRejectedValue(axiosErrorWithStatus(404));

    await expect(getCharacterInfo("없음")).rejects.toMatchObject({
      status: 404,
      code: "LOSTARK_404",
    });
  });

  it("maps rate limiting to 429 rather than a server error", async () => {
    holder.get = vi.fn().mockRejectedValue(axiosErrorWithStatus(429));

    await expect(getCharacterInfo("테스트")).rejects.toMatchObject({
      status: 429,
    });
  });

  it("fails with 503 when the api key is not configured", async () => {
    holder.get = null;

    await expect(getCharacterInfo("테스트")).rejects.toMatchObject({
      status: 503,
      code: "LOSTARK_API_KEY_MISSING",
    });
  });
});
