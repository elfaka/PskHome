package kr.elfaka.lostark.survey.controller;

import kr.elfaka.lostark.survey.dto.AnalyzeResultDto;
import kr.elfaka.lostark.survey.service.AnalyzeService;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.web.bind.annotation.*;

/**
 * AnalyzeController
 *
 * [역할]
 * - 특정 Google Form에 대해 "응답 분석 결과"를 반환하는 API 제공
 * - 단순 응답 나열이 아니라, 분석에 최적화된 DTO(AnalyzeResultDto) 형태로 응답
 *
 * [프론트 연계]
 * - AnalyzePage.tsx 에서 호출
 *   GET /api/forms/{formId}/analyze
 *
 * [보안]
 * - /api/forms/** 경로는 SecurityConfig에서 authenticated()로 보호됨
 * - OAuth2AuthenticationToken을 통해 로그인한 사용자 계정의 설문만 분석 가능
 */
@RestController
@RequestMapping("/api/forms")
public class AnalyzeController {

    private final AnalyzeService analyzeService;

    /**
     * 생성자 주입
     *
     * @param analyzeService 설문 응답 분석 비즈니스 로직 담당 서비스
     */
    public AnalyzeController(AnalyzeService analyzeService) {
        this.analyzeService = analyzeService;
    }

    /**
     * GET /api/forms/{formId}/analyze
     *
     * [역할]
     * - 특정 설문(formId)에 대한 응답을 수집하고
     *   문항별로 집계/분석한 결과를 반환
     *
     * [쿼리 파라미터]
     * - limit: 분석에 사용할 최대 응답 수
     *          (응답이 매우 많은 설문에서 성능/비용 보호 목적)
     *
     * [프론트 사용 예]
     * - 분석 페이지 최초 진입
     * - 필터 변경 후 재분석
     *
     * @param auth OAuth2 로그인 정보 (Google access token 포함)
     * @param formId Google Form ID
     * @param limit 분석에 사용할 최대 응답 수 (기본값 200)
     * @return 설문 분석 결과 DTO
     */
    @GetMapping("/{formId}/analyze")
    public AnalyzeResultDto analyze(
            OAuth2AuthenticationToken auth,
            @PathVariable("formId") String formId,
            @RequestParam(name = "limit", defaultValue = "200") int limit
    ) {
        return analyzeService.analyze(auth, formId, limit);
    }
}
/*
“AnalyzeController는 설문 응답을 단순 조회가 아니라 분석 결과로 가공해 전달하는 API입니다.
OAuth2 인증 컨텍스트를 그대로 활용해 사용자 소유 설문만 분석하도록 했고,
대용량 응답을 고려해 limit 기반 보호 장치를 둔 것이 특징입니다.”
 */
