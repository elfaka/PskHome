package kr.elfaka.lostark.survey.dto;

import java.util.List;

/**
 * FormDetailDto
 *
 * [역할]
 * - 특정 Google Form 하나의 "구조 정보"를 표현하는 DTO
 * - 설문 제목 + 문항 목록을 포함하며,
 *   분석 UI를 구성하기 위한 기준 데이터 역할을 한다.
 *
 * [사용 위치]
 * - FormsController.detail()
 * - AnalyzeService (문항 메타 기준으로 응답 분석)
 *
 * [설계 의도]
 * - Google Forms API의 복잡한 Item/Question 구조를
 *   프론트에서 사용하기 쉬운 형태로 정규화
 * - 문항 타입(type)과 보기(options)를 명확히 분리하여
 *   프론트에서 조건 분기 없이 렌더링 가능하게 한다.
 *
 * @param formId   Google Form ID
 * @param title    설문 제목
 * @param questions 설문에 포함된 문항 목록
 */
public record FormDetailDto(
        String formId,
        String title,
        List<QuestionDto> questions
) {

    /**
     * QuestionDto
     *
     * [역할]
     * - 설문 내 "개별 문항" 하나를 표현하는 DTO
     *
     * [중요 포인트]
     * - questionId:
     *   응답 데이터(FormResponsesDto) 및 분석 결과와 매칭되는 키
     *
     * - type:
     *   프론트 렌더링 및 분석 로직 분기를 위한 문항 타입
     *
     * - options:
     *   객관식/척도형 문항일 때만 채워지며,
     *   TEXT/UNKNOWN 타입일 경우 빈 리스트
     *
     * [type 값 정의]
     * - CHOICE        : 단일 객관식
     * - CHOICE_MULTI  : 복수 객관식
     * - SCALE         : 선형 배율(척도형)
     * - TEXT          : 주관식
     * - UNKNOWN       : 아직 분석 UI에서 처리하지 않는 타입
     */
    public record QuestionDto(
            String questionId,
            String title,
            String type,
            List<String> options
    ) {}
}
