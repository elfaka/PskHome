package kr.elfaka.lostark.survey.dto;

import java.util.List;

public record AnalyzeResultDto(
        Meta meta,
        List<QuestionSummary> summaries
) {
    public record Meta(
            String formId,
            String title,
            int analyzedResponses
    ) {}

    public record QuestionSummary(
            String questionId,
            String questionTitle,
            String type,                 // CHOICE / TEXT / UNKNOWN
            List<OptionStat> options,    // CHOICE일 때
            TextStat text                // TEXT일 때
    ) {}

    public record OptionStat(
            String label,
            int count,
            double rate
    ) {}

    public record TextStat(
            int count,
            List<String> samples
    ) {}
}
