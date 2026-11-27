import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { disconnectPrisma } from "./lib/prisma.js";
import { startIntradaySampler } from "./modules/stocksim/investorFlow.service.js";
import { describeTraderAuthConfig } from "./modules/trader/traderAuth.service.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(
    `[psk-home-be] listening on :${env.PORT} (NODE_ENV=${env.NODE_ENV})`
  );
  // 값은 남기지 않고 /trader 로그인 설정이 들어왔는지만 남긴다
  console.log(
    describeTraderAuthConfig({
      username: env.TRADER_ADMIN_USERNAME,
      passwordHash: env.TRADER_ADMIN_PASSWORD_HASH,
    })
  );
});

// 투자자 동향 장중 스냅샷 수집 (오늘 조회된 종목만, 장중에만 토스를 부른다)
startIntradaySampler();

/**
 * 그레이스풀 셧다운.
 * 컨테이너 재배포 시 처리 중인 요청을 끊지 않고, DB 커넥션 풀을 정리한다.
 */
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[psk-home-be] received ${signal}, shutting down...`);

    server.close(() => {
      void disconnectPrisma().finally(() => process.exit(0));
    });
  });
}
