import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(
    `[psk-home-be] listening on :${env.PORT} (NODE_ENV=${env.NODE_ENV})`
  );
});
