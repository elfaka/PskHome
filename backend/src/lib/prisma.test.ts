import { describe, it, expect } from "vitest";

import { poolConfigFromUrl } from "./prisma.js";

describe("poolConfigFromUrl", () => {
  it("splits a connection url into pool options", () => {
    const config = poolConfigFromUrl(
      "mysql://root:secret@pskhome-db-1:3306/page"
    );

    expect(config).toMatchObject({
      host: "pskhome-db-1",
      port: 3306,
      user: "root",
      password: "secret",
      database: "page",
    });
  });

  it("defaults to port 3306 when omitted", () => {
    expect(poolConfigFromUrl("mysql://root:pw@db/page").port).toBe(3306);
  });

  it("percent-decodes credentials", () => {
    const config = poolConfigFromUrl(
      "mysql://us%40er:p%40ss%2Fword@db:3306/page"
    );

    expect(config.user).toBe("us@er");
    expect(config.password).toBe("p@ss/word");
  });

  /**
   * MySQL 8 의 caching_sha2_password 는 평문 연결에서 서버 RSA 공개키를 받아와야 한다.
   * 이 옵션이 꺼져 있으면 커넥션이 하나도 만들어지지 않고
   * "pool timeout ... active=0 idle=0" 으로만 드러나 원인 파악이 어렵다.
   */
  it("enables public key retrieval for caching_sha2_password", () => {
    const config = poolConfigFromUrl("mysql://root:pw@db:3306/page");

    expect(config.allowPublicKeyRetrieval).toBe(true);
  });

  it("reports a malformed url instead of failing later at connect time", () => {
    expect(() => poolConfigFromUrl("not-a-url")).toThrow(
      /not a valid connection URL/
    );
  });

  it("reports a missing database name", () => {
    expect(() => poolConfigFromUrl("mysql://root:pw@db:3306")).toThrow(
      /missing a host or database name/
    );
  });
});
