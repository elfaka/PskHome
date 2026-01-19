package kr.elfaka.lostark.survey.dto;

/**
 * FormListItemDto
 *
 * [역할]
 * - 로그인한 사용자의 Google Forms "설문 목록" 화면에서
 *   한 개 설문을 표현하기 위한 DTO
 *
 * [사용 위치]
 * - FormsController.list() → 프론트 FormsList 페이지
 *
 * [설계 의도]
 * - 목록 화면에서는 상세 정보가 필요 없으므로
 *   id / name / 수정 시각만 포함하여 응답 크기를 최소화한다.
 *
 * [필드 설명]
 * @param formId        Google Form ID (설문 선택/상세 조회 시 사용)
 * @param name          설문 제목
 * @param modifiedTime  마지막 수정 시각 (RFC3339 문자열)
 */
public record FormListItemDto(
        String formId,
        String name,
        String modifiedTime
) {}
