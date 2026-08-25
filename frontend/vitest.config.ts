import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // 기존 vite.config.ts 에서 쓰던 설정을 유지한다.
    preserveSymlinks: true,
    // tsconfig 의 `@/*` 경로 별칭을 그대로 사용한다.
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    pool: "forks",
  },
});
