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

            // 문항별 응답자 수(분모): 해당 문항에 값이 1개라도 있는 응답 수
            int answeredCount = 0;

            // 값 수집(복수선택이면 여러 개)
            List<String> allValues = new ArrayList<>();

            for (FormResponsesDto.FormResponseDto r : responses) {
                if (r.answers() == null) continue;
                FormResponsesDto.AnswerDto ans = r.answers().get(qid);
                if (ans == null || ans.values() == null) continue;

                boolean hasAny = false;
                for (String v : ans.values()) {
                    if (v != null && !v.isBlank()) {
                        hasAny = true;
                        allValues.add(v.trim());
                    }
                }
                if (hasAny) answeredCount++;
            }

            boolean isChoice = "CHOICE".equals(q.type()) || "CHOICE_MULTI".equals(q.type()) || "SCALE".equals(q.type());

            if (isChoice) {
                // ------------------------
                // 선택형/척도형 집계
                // ------------------------

                // SCALE의 경우: 응답값은 보통 "1","2" 숫자, 옵션은 "1 (라벨)"처럼 올 수 있음
                // -> 매칭키를 숫자(raw)로 통일
                Map<String, Integer> countsByKey = new LinkedHashMap<>();

                if ("SCALE".equals(q.type())) {
                    for (String v : allValues) {
                        String key = extractLeadingNumber(v);
                        if (key == null) continue;
                        countsByKey.put(key, countsByKey.getOrDefault(key, 0) + 1);
                    }
                } else {
                    // CHOICE/CHOICE_MULTI는 값 자체로 카운트
                    for (String v : allValues) {
                        countsByKey.put(v, countsByKey.getOrDefault(v, 0) + 1);
                    }
                }

                List<AnalyzeResultDto.OptionStat> optionStats = new ArrayList<>();

                if ("SCALE".equals(q.type())) {
                    // ✅ SCALE은 0 응답도 포함: options 순서대로 출력
                    List<String> options = (q.options() == null) ? List.of() : q.options();
                    for (String opt : options) {
                        String key = extractLeadingNumber(opt);
                        if (key == null) key = opt;

                        int count = countsByKey.getOrDefault(key, 0);
                        double rate = answeredCount == 0 ? 0.0 : round2((double) count * 100.0 / answeredCount);

                        optionStats.add(new AnalyzeResultDto.OptionStat(opt, count, rate));
                    }
                } else {
                    // ✅ CHOICE/CHOICE_MULTI는 “등장한 값”만 출력 (원하면 0 포함도 가능)
                    List<Map.Entry<String, Integer>> sorted = new ArrayList<>(countsByKey.entrySet());
                    sorted.sort((a, b) -> Integer.compare(b.getValue(), a.getValue()));

                    for (var e : sorted) {
                        double rate = answeredCount == 0 ? 0.0 : round2((double) e.getValue() * 100.0 / answeredCount);
                        optionStats.add(new AnalyzeResultDto.OptionStat(e.getKey(), e.getValue(), rate));
                    }
                }

                summaries.add(new AnalyzeResultDto.QuestionSummary(
                        qid,
                        q.title(),
                        q.type(),
                        optionStats,
                        null
                ));
            } else {
                // ------------------------
                // TEXT/UNKNOWN 집계
                // ------------------------
                List<String> samples = allValues.stream().limit(20).toList();

                summaries.add(new AnalyzeResultDto.QuestionSummary(
                        qid,
                        q.title(),
                        q.type(),
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

    /**
     * 문자열 앞부분의 숫자만 추출
     * - "1" -> "1"
     * - "1 (매우 불만족)" -> "1"
     * - "  10점" -> "10"
     * - 숫자로 시작하지 않으면 null
     */
    private static String extractLeadingNumber(String s) {
        if (s == null) return null;
        String x = s.trim();
        if (x.isEmpty()) return null;

        int i = 0;
        while (i < x.length() && Character.isDigit(x.charAt(i))) i++;
        if (i == 0) return null;

        return x.substring(0, i);
    }
}
