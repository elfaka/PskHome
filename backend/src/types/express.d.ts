/**
 * `req.user` 의 형태를 프로젝트 타입으로 확정한다.
 *
 * 기존 Spring 에서는 `OAuth2AuthenticationToken` + `OAuth2AuthorizedClientService` 조합으로
 * "로그인 사용자"와 "그 사용자의 Google access token"을 따로 들고 있었다.
 * Express 에서는 세션에 저장되는 사용자 객체 하나가 두 역할을 겸한다.
 */
declare global {
  namespace Express {
    interface User {
      /** Google 계정 고유 식별자 (OIDC `sub`) */
      id: string;
      /** 헤더 표시용 이름 */
      name: string;
      email?: string;
      /** Google API 호출에 사용할 access token */
      accessToken: string;
      refreshToken?: string;
    }
  }
}

export {};
