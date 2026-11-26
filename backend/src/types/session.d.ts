import type { PortfolioState } from "../modules/stocksim/stockSim.types.js";

/**
 * 세션에 저장하는 값의 타입.
 *
 * 모의투자 포트폴리오는 로그인 없이 브라우저 세션 단위로 둔다.
 * 세션 저장소가 프로세스 메모리라 재배포하면 초기화된다 (초안 단계의 의도된 제약).
 */
declare module "express-session" {
  interface SessionData {
    stocksim?: PortfolioState;
    /** 자동매매(/trader) 로그인. Google 로그인(passport)과 별개다. 시각은 epoch ms */
    trader?: { username: string; loginAt: number; lastSeenAt: number };
    /** passport 가 쓰는 키. trader 로그인 시 세션 재발급 후 옮겨 담는다 */
    passport?: unknown;
  }
}

export {};
