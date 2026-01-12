package kr.elfaka.lostark.survey.dto;

import java.util.List;

public record FormDetailDto(
        String formId,
        String title,
        List<QuestionDto> questions
) {
    public record QuestionDto(
            String questionId,
            String title,
            String type,          // CHOICE / TEXT / UNKNOWN
            List<String> options  // choice일 때만 채움
    ) {}
}
