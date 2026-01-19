package kr.elfaka.lostark.survey.controller;

import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * PingController
 *
 * [역할]
 * - 서버 헬스체크(Health Check)용 최소 엔드포인트 제공
 * - 인증/권한/비즈니스 로직과 무관하게
 *   "서버가 살아 있는지"를 빠르게 확인하기 위한 목적
 *
 * [접근 제어]
 * - SecurityConfig에서 /api/ping 은 permitAll 로 설정되어
 *   로그인 여부와 상관없이 호출 가능해야 한다.
 *
 * [실무 활용 예]
 * - 배포 후 서버 기동 확인
 *   curl https://elfaka.kr/api/ping
 * - Nginx reverse proxy /api 라우팅 테스트
 * - 모니터링/로드밸런서 헬스체크 엔드포인트
 *
 * [주의]
 * - 응답은 반드시 빠르고 가벼워야 하므로
 *   DB 조회, 외부 API 호출 등은 절대 넣지 않는다.
 */
@RestController
@RequestMapping("/api")
public class PingController {

    /**
     * GET /api/ping
     *
     * @return
     * - 정상 응답 예:
     *   { "ok": true }
     */
    @GetMapping("/ping")
    public Map<String, Object> ping() {
        return Map.of("ok", true);
    }
}

/*
“배포 환경에서 reverse proxy, 인증 설정,
서버 기동 상태를 빠르게 검증하기 위해 인증이 필요 없는
헬스체크 엔드포인트(/api/ping)를 분리해 두었습니다.”
*/
