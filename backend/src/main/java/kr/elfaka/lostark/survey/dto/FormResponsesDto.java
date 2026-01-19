package kr.elfaka.lostark.survey.dto;

import java.util.List;
import java.util.Map;

/**
 * FormResponsesDto
 *
 * [역할]
 * - Google Forms API로부터 가져온 "설문 응답 데이터"를
 *   서비스/분석 계층에서 사용하기 쉬운 형태로 표현한 DTO
 *
 * [구조 요약]
 * - formId          : 설문 ID
 * - nextPageToken   : 다음 페이지 응답 조회를 위한 토큰
 * - responses       : 설문 응답 목록
 *
 * [사용 위치]
 * - FormsService.listResponses()
 * - AnalyzeService (문항별 응답 집계)
 */
public record FormResponsesDto(
        String formId,
        String nextPageToken,
        List<FormResponseDto> responses
) {

    /**
     * FormResponseDto
     *
     * [역할]
     * - 설문에 대한 "개별 응답자 1명의 응답"을 표현
     *
     * [answers 구조]
     * - key   : questionId (FormDetailDto.QuestionDto.questionId)
     * - value : AnswerDto (문항에 대한 실제 답변)
     *
     * → questionId 기준 매핑 덕분에
     *   분석 시 문항별 응답 접근이 매우 단순해진다.
     */
    public record FormResponseDto(
            String responseId,
            String createTime,
            String lastSubmittedTime,
            Map<String, AnswerDto> answers
    ) {}

    /**
     * AnswerDto
     *
     * [역할]
     * - 특정 문항(questionId)에 대한 응답 내용을 표현
     *
     * [values]
     * - 선택형/주관식 응답 값
     * - Google Forms API에서는
     *   단일 선택, 복수 선택, 주관식 모두
     *   textAnswers → 문자열 배열로 내려오는 경우가 일반적
     *
     * [files]
     * - 파일 업로드 문항의 경우 사용
     * - 파일 ID / 파일명 / MIME 타입 포함
     *
     * [설계 포인트]
     * - 선택형/주관식/파일 업로드를 하나의 DTO로 통합해
     *   분석 서비스에서 분기 처리만 하면 되도록 단순화
     */
    public record AnswerDto(
            List<String> values,
            List<FileDto> files
    ) {}

    /**
     * FileDto
     *
     * [역할]
     * - 파일 업로드 문항의 개별 파일 정보를 표현
     *
     * [사용 예]
     * - 파일 다운로드 링크 생성
     * - 파일 타입별 분류 (이미지, PDF 등)
     */
    public record FileDto(
            String fileId,
            String fileName,
            String mimeType
    ) {}
}
/*
“Google Forms의 응답 구조를 questionId 기준 Map으로 정규화해,
문항별 분석 로직을 단순하고 안정적으로 구현했습니다.”
 */