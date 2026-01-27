package kr.elfaka.lostark.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    /**
     * 로그인 성공 후 리다이렉트될 URL.
     *
     * - 운영/로컬 환경에 따라 프론트 주소(혹은 라우트)가 달라질 수 있으므로
     *   application-prod.yml / application-local.yml 등에서 분리하여 주입한다.
     *
     * - SPA(React) 구조에서는 보통 "/googleform/forms" 같은 프론트 라우트로 보내,
     *   프론트가 로그인 이후 화면을 이어서 그리도록 설계한다.
     */
    @Value("${app.login-success-redirect}")
    private String loginSuccessRedirect;

    /**
     * Spring Security 필터 체인 구성
     *
     * [설계 의도]
     * 1) API 보안 경계:
     *    - /api/** 경로는 "백엔드 API"로 간주하고 기본적으로 인증을 요구한다.
     *    - 인증/헬스체크/OAuth 플로우처럼 예외적으로 공개되어야 하는 엔드포인트만 permitAll 처리한다.
     *
     * 2) OAuth2 엔드포인트 경로 통일:
     *    - reverse proxy(Nginx) 하에서 프론트/백엔드가 공존하는 경우,
     *      OAuth2 redirect_uri가 "도메인/경로"에 매우 민감해 문제(redirect_uri_mismatch)가 잦다.
     *    - 그래서 OAuth2 시작/콜백 URL을 모두 /api 하위로 고정하여
     *      프록시 라우팅 및 Google Console 승인 redirect URI 관리를 단순화했다.
     *
     * 3) CSRF:
     *    - 현재는 세션 기반 + REST 호출 구조에서 프론트가 별도 도메인이거나
     *      API 호출이 많기 때문에 우선 disable.
     *    - 운영 보안 강화를 원하면, "상태 변경(POST/PUT/DELETE)"에 대해 CSRF 토큰 적용 여부를 재검토 가능.
     */
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // ✅ 개발/초기 통합 단계에서 API 호출 편의를 위해 CSRF 비활성화
                .csrf(csrf -> csrf.disable())

                /**
                 * 인가(Authorization) 정책
                 *
                 * - permitAll: 인증 없이 접근 허용 (로그인 전에도 호출되어야 하는 엔드포인트)
                 * - authenticated: 로그인한 사용자만 접근 가능
                 */
                .authorizeHttpRequests(auth -> auth
                        // ✅ 인증 없이 접근 허용 (헬스체크/세션상태/OAuth 플로우)
                        .requestMatchers(
                                "/api/ping",                 // 헬스체크/배포 상태 확인
                                "/api/auth/me",              // 프론트에서 로그인 상태 확인
                                "/error",                    // Spring 기본 에러 엔드포인트
                                "/api/oauth2/**",            // OAuth2 로그인 시작 엔드포인트
                                "/api/login/oauth2/**",       // OAuth2 콜백(인가코드 수신) 엔드포인트

                                "/api/json/**",  // ✅ JSON Prettier 공개 API
                                "/api/posts/**"

                ).permitAll()

                        // ✅ 앞으로 만들 API는 로그인 필요 (보안 경계를 /api/**로 단순화)
                        .requestMatchers("/api/**").authenticated()

                        // ✅ 그 외 경로는 프론트/정적 서빙 등을 고려해 우선 허용
                        //    (추후 운영 단계에서 필요한 경우 tighter하게 조정 가능)
                        .anyRequest().permitAll()
                )

                /**
                 * OAuth2 로그인 설정
                 *
                 * - authorizationEndpoint.baseUri:
                 *   프론트에서 로그인 버튼 클릭 시 호출하는 엔드포인트
                 *   (ex: /api/oauth2/authorization/google)
                 *
                 * - redirectionEndpoint.baseUri:
                 *   Google이 인가코드를 가지고 돌아오는 콜백 엔드포인트
                 *   (ex: /api/login/oauth2/code/google)
                 *
                 * - defaultSuccessUrl:
                 *   로그인 성공 후 리다이렉트될 URL (프론트 라우트로 보내는 용도)
                 *   두 번째 파라미터 true:
                 *   이전 요청 URL을 기억해도 "항상 이 URL로" 보내도록 고정
                 */
                .oauth2Login(oauth -> oauth
                        .authorizationEndpoint(a -> a.baseUri("/api/oauth2/authorization"))
                        .redirectionEndpoint(r -> r.baseUri("/api/login/oauth2/code/*"))
                        .defaultSuccessUrl(loginSuccessRedirect, true)
                )

                /**
                 * 로그아웃 처리
                 *
                 * - 프론트에서 POST /api/auth/logout 호출로 세션 제거
                 * - JSESSIONID 쿠키 제거 + 인증 정보 삭제 + 세션 무효화
                 * - SPA에서는 로그아웃 후 프론트 라우트로 이동하여 UI 상태를 초기화하는 패턴이 일반적
                 */
                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .invalidateHttpSession(true)
                        .clearAuthentication(true)
                        .deleteCookies("JSESSIONID")
                );

        return http.build();
    }
}
/*
“Reverse proxy(Nginx) + SPA 구조에서 OAuth2 redirect_uri 문제를 피하기 위해,
Spring Security의 OAuth2 엔드포인트 baseUri를 /api/...로 일원화했습니다.
또한 /api/**는 인증을 요구하고, 인증 관련 엔드포인트와 헬스체크만 permitAll로 분리해 보안 경계를 명확히 했습니다.
로그인 성공 후에는 환경변수로 관리되는 프론트 라우트로 리다이렉트해 로컬/운영 환경을 유연하게 운영합니다.”
 */