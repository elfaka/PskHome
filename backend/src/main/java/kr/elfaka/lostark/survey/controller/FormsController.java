package kr.elfaka.lostark.survey.controller;

import kr.elfaka.lostark.survey.dto.*;
import kr.elfaka.lostark.survey.service.FormsService;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * FormsController
 *
 * [역할]
 * - Google Forms API와 연동된 "설문 관련 API"의 진입점
 * - 로그인된 사용자의 OAuth2AuthenticationToken을 기반으로
 *   본인 소유의 설문 목록, 설문 구조, 설문 응답을 조회한다.
 *
 * [설계 원칙]
 * - Controller는 HTTP 요청/응답 처리만 담당
 * - 실제 Google API 호출 및 데이터 가공은 FormsService에 위임
 *
 * [보안]
 * - /api/forms/** 경로는 SecurityConfig에서 authenticated()로 보호됨
 * - 즉, OAuth2 로그인 완료 후에만 접근 가능
 */
@RestController
@RequestMapping("/api/forms")
public class FormsController {

    private final FormsService formsService;

    /**
     * 생성자 주입
     *
     * @param formsService Google Forms 관련 비즈니스 로직을 담당하는 서비스
     */
    public FormsController(FormsService formsService) {
        this.formsService = formsService;
    }

    /**
     * GET /api/forms
     *
     * [역할]
     * - 현재 로그인한 사용자의 Google Forms 설문 목록 조회
     *
     * [프론트 사용 예]
     * - 설문 선택 화면 (FormsList 페이지)
     *
     * @param auth OAuth2 로그인 정보 (Google access token 포함)
     * @return 사용자가 접근 가능한 설문 목록
     */
    @GetMapping
    public List<FormListItemDto> list(OAuth2AuthenticationToken auth) {
        return formsService.listMyForms(auth);
    }

    /**
     * GET /api/forms/{formId}
     *
     * [역할]
     * - 특정 설문의 구조(제목, 문항, 보기, 타입 등) 조회
     *
     * [프론트 사용 예]
     * - 설문 분석 페이지 진입 시, 문항 카드 구성용 데이터
     *
     * @param auth OAuth2 로그인 정보
     * @param formId Google Form ID
     * @return 설문 상세 정보 (문항/보기 구조)
     */
    @GetMapping("/{formId}")
    public FormDetailDto detail(
            OAuth2AuthenticationToken auth,
            @PathVariable("formId") String formId
    ) {
        return formsService.getFormDetail(auth, formId);
    }

    /**
     * GET /api/forms/{formId}/responses
     *
     * [역할]
     * - 특정 설문의 응답 데이터 조회
     * - Google Forms API 특성상 페이지네이션(pageToken)을 사용
     *
     * [쿼리 파라미터]
     * - limit: 한 번에 가져올 응답 수 (1~500)
     * - pageToken: 다음 페이지 조회용 토큰
     *
     * [프론트 사용 예]
     * - 응답 요약/분석
     * - 전체 응답을 반복 호출하여 수집 가능
     *
     * @param auth OAuth2 로그인 정보
     * @param formId Google Form ID
     * @param limit 페이지 크기 (안전 제한 적용)
     * @param pageToken 다음 페이지 토큰 (없으면 첫 페이지)
     * @return 설문 응답 데이터 + 다음 페이지 토큰
     */
    @GetMapping("/{formId}/responses")
    public FormResponsesDto responses(
            OAuth2AuthenticationToken auth,
            @PathVariable("formId") String formId,
            @RequestParam(name = "limit", defaultValue = "50") int limit,
            @RequestParam(name = "pageToken", required = false) String pageToken
    ) {
        // Google Forms API 제한을 고려한 안전한 page size 제한
        int pageSize = Math.min(Math.max(limit, 1), 500);

        return formsService.listResponses(auth, formId, pageSize, pageToken);
    }
}
/*
“FormsController는 Google OAuth2 인증 컨텍스트를 그대로 서비스 계층에 전달해,
로그인한 사용자의 Google Forms 데이터만 접근하도록 설계했습니다.
Controller는 얇게 유지하고, Google API 호출과 페이지네이션 로직은 전부 서비스 계층에 위임했습니다.”
*/