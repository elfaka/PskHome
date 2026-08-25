import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { disconnectPrisma } from "./lib/prisma.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(
    `[psk-home-be] listening on :${env.PORT} (NODE_ENV=${env.NODE_ENV})`
  );
});

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
