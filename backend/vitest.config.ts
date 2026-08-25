import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // 외부 의존(MySQL/Redis/Google/LostArk) 없이 실행되어야 한다.
    env: {
      NODE_ENV: "test",
    },
  },
});
