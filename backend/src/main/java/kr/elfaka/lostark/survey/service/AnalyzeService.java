package kr.elfaka.lostark.survey.service;

import kr.elfaka.lostark.survey.dto.*;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class AnalyzeService {

    private final FormsService formsService;

    public AnalyzeService(FormsService formsService) {
        this.formsService = formsService;
    }

    public AnalyzeResultDto analyze(OAuth2AuthenticationToken auth, String formId, int limit) {
        FormDetailDto form = formsService.getFormDetail(auth, formId);

        int pageSize = Math.min(Math.max(limit, 1), 500);
        FormResponsesDto responsesDto = formsService.listResponses(auth, formId, pageSize, null);

        List<FormResponsesDto.FormResponseDto> responses = responsesDto.responses();
        int total = responses == null ? 0 : responses.size();

        List<AnalyzeResultDto.QuestionSummary> summaries = new ArrayList<>();

        for (FormDetailDto.QuestionDto q : form.questions()) {
            String qid = q.questionId();

            List<String> allValues = new ArrayList<>();
            for (FormResponsesDto.FormResponseDto r : responses) {
                if (r.answers() == null) continue;
                FormResponsesDto.AnswerDto ans = r.answers().get(qid);
                if (ans == null || ans.values() == null) continue;

                for (String v : ans.values()) {
                    if (v != null && !v.isBlank()) allValues.add(v.trim());
                }
            }

            boolean isChoice = "CHOICE".equals(q.type()) || "CHOICE_MULTI".equals(q.type()) || "SCALE".equals(q.type());

            if (isChoice) {
                Map<String, Integer> counts = new LinkedHashMap<>();
                for (String v : allValues) {
                    counts.put(v, counts.getOrDefault(v, 0) + 1);
                }

                List<Map.Entry<String, Integer>> sorted = new ArrayList<>(counts.entrySet());
                sorted.sort((a, b) -> Integer.compare(b.getValue(), a.getValue()));

                List<AnalyzeResultDto.OptionStat> optionStats = new ArrayList<>();
                for (var e : sorted) {
                    double rate = total == 0 ? 0.0 : round2((double) e.getValue() * 100.0 / total);
                    optionStats.add(new AnalyzeResultDto.OptionStat(e.getKey(), e.getValue(), rate));
                }

                summaries.add(new AnalyzeResultDto.QuestionSummary(
                        qid, q.title(), q.type(),
                        optionStats,
                        null
                ));
            } else {
                // TEXT / UNKNOWN 등은 텍스트로 처리
                List<String> samples = allValues.stream().limit(20).toList();
                summaries.add(new AnalyzeResultDto.QuestionSummary(
                        qid, q.title(), q.type(),
                        List.of(),
                        new AnalyzeResultDto.TextStat(allValues.size(), samples)
                ));
            }
        }

        return new AnalyzeResultDto(
                new AnalyzeResultDto.Meta(formId, form.title(), total),
                summaries
        );
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
