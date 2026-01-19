package kr.elfaka.lostark.survey.controller;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * AuthController
 *
 * [역할]
 * - SPA(React)에서 "현재 로그인 상태"를 확인하기 위한 API 제공
 * - 세션 기반(Spring Security) 인증을 사용하므로,
 *   브라우저가 JSESSIONID 쿠키를 가지고 있으면 Authentication이 채워진다.
 *
 * [프론트 사용 흐름]
 * - 앱 최초 진입 시 /api/auth/me 호출
 *   -> authenticated: true/false 로 라우팅 분기 (로그인 화면 / 설문 목록 화면 등)
 *
 * [주의]
 * - SecurityConfig에서 /api/auth/me 는 permitAll로 열려 있어야 로그인 전에도 호출 가능.
 * - 이 API는 "사용자 정보"를 최소한으로만 반환하여(예: name)
 *   불필요한 개인정보 노출을 줄이는 방향으로 설계.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    /**
     * GET /api/auth/me
     *
     * [의도]
     * - 현재 요청이 인증된 사용자 세션인지 확인하고, 프론트가 쓸 최소 정보만 반환.
     *
     * [Authentication 파라미터]
     * - Spring Security가 현재 요청 컨텍스트에서 인증 정보를 주입해준다.
     * - 인증되지 않은 상태면 null이거나 isAuthenticated()가 false일 수 있다.
     *
     * @return
     * - 로그인 안 됨: { "authenticated": false }
     * - 로그인 됨: { "authenticated": true, "name": "<username>" }
     */
    @GetMapping("/me")
    public Map<String, Object> me(Authentication authentication) {
        // 인증 정보가 없거나(로그인 전), 인증되지 않은 상태면 false 반환
        if (authentication == null || !authentication.isAuthenticated()) {
            return Map.of("authenticated", false);
        }

        // 인증된 사용자라면 최소 정보만 반환 (프론트 헤더 등에 표시)
        return Map.of(
                "authenticated", true,
                "name", authentication.getName()
        );
    }
}
