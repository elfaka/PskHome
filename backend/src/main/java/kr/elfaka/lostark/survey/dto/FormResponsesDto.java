package kr.elfaka.lostark.survey.dto;

import java.util.List;
import java.util.Map;

public record FormResponsesDto(
        String formId,
        String nextPageToken,
        List<FormResponseDto> responses
) {
    public record FormResponseDto(
            String responseId,
            String createTime,
            String lastSubmittedTime,
            Map<String, AnswerDto> answers
    ) {}

    /**
     * Forms API에서는 선택형/주관식 모두 textAnswers로 문자열 배열이 내려오는 경우가 일반적.
     * (checkbox 같이 복수 선택도 values에 여러 개 들어옴)
     */
    public record AnswerDto(
            List<String> values,
            List<FileDto> files
    ) {}

    public record FileDto(
            String fileId,
            String fileName,
            String mimeType
    ) {}
}
