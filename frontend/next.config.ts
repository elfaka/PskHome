import type { NextConfig } from "next";

/**
 * 개발 서버에서 `/api/*` 를 백엔드로 프록시한다.
 * (기존 `vite.config.ts` 의 `server.proxy` 와 동일한 역할)
 *
 * 프로덕션에서는 traefik/리버스 프록시가 `/api` 를 백엔드로 보내므로
 * Next 서버가 다시 프록시하지 않는다.
 */
const apiProxyTarget =
  process.env.API_PROXY_TARGET ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8080" : "");

const nextConfig: NextConfig = {
  // Docker 이미지에 필요한 파일만 담기 위한 독립 실행형 빌드
  output: "standalone",

  async rewrites() {
    if (!apiProxyTarget) return [];

    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
