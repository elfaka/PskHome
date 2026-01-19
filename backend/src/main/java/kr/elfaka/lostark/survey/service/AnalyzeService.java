package kr.elfaka.lostark.survey.service;

import kr.elfaka.lostark.survey.dto.*;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * AnalyzeService
 *
 * [역할]
 * - FormsService로부터 가져온 "설문 구조(FormDetailDto)" + "응답(FormResponsesDto)"을 기반으로
 *   문항별 집계/분석 결과(AnalyzeResultDto)를 생성한다.
 *
 * [핵심 설계 포인트]
 * 1) rate(응답 비율)는 "전체 응답 수(total)"가 아니라
 *    "해당 문항에 실제로 응답한 응답자 수(answeredCount)"를 분모로 사용한다.
 *    → 문항별 분석이 더 정확해짐 (너가 요구했던 기준)
 *
 * 2) SCALE(선형 배율)은 옵션이 "1 (라벨)", "10 (라벨)"처럼 내려와도
 *    실제 응답값은 "1", "10" 같은 숫자로 오는 경우가 많다.
 *    → 숫자(raw)로 매칭키를 통일해서 집계한다.
 *
 * 3) SCALE은 0 응답 옵션도 포함해서 출력한다.
 *    → FormDetailDto의 options 순서(=점수 오름차순)대로 순회하며 누락은 0으로 채운다.
 *
 * 4) CHOICE/CHOICE_MULTI는 현재 "응답에 등장한 보기"만 출력하도록 설계되어 있다.
 *    (0 응답 보기까지 포함하려면 FormsService/DTO에서 전체 보기 목록을 함께 내려주면 확장 가능)
 */
@Service
public class AnalyzeService {

    private final FormsService formsService;

    public AnalyzeService(FormsService formsService) {
        this.formsService = formsService;
    }

    /**
     * 설문 분석 실행
     *
     * @param auth OAuth2 로그인 토큰(구글 API 호출용)
     * @param formId Google Form ID
     * @param limit 분석에 사용할 최대 응답 수 (1~500으로 안전 제한)
     * @return AnalyzeResultDto (문항별 요약 + 메타)
     */
    public AnalyzeResultDto analyze(OAuth2AuthenticationToken auth, String formId, int limit) {
        // 1) 설문 구조(문항 타입/보기 등)
        FormDetailDto form = formsService.getFormDetail(auth, formId);

        // 2) 응답 목록 조회 (Forms API는 페이지네이션이 가능하지만,
        //    현재는 첫 페이지(limit 크기)만 분석에 사용)
        int pageSize = Math.min(Math.max(limit, 1), 500);
        FormResponsesDto responsesDto = formsService.listResponses(auth, formId, pageSize, null);

        List<FormResponsesDto.FormResponseDto> responses =
                responsesDto.responses() == null ? List.of() : responsesDto.responses();

        int total = responses.size(); // 이번 분석에 포함된 응답 수

        List<AnalyzeResultDto.QuestionSummary> summaries = new ArrayList<>();

        // 3) 문항별 분석
        for (FormDetailDto.QuestionDto q : form.questions()) {
            String qid = q.questionId();

            // ✅ 문항별 응답자 수(분모): 해당 문항에 값이 1개라도 있는 응답 수
            int answeredCount = 0;

            // ✅ 모든 답변 값 수집(복수선택이면 여러 개가 들어갈 수 있음)
            List<String> allValues = new ArrayList<>();

            // 3-1) 응답을 돌며 해당 문항 값 수집
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

                // 값이 하나라도 있으면 "이 문항에 응답한 응답자"로 카운트
                if (hasAny) answeredCount++;
            }

            // 3-2) 문항 타입에 따른 분기
            boolean isChoice =
                    "CHOICE".equals(q.type()) ||
                            "CHOICE_MULTI".equals(q.type()) ||
                            "SCALE".equals(q.type());

            if (isChoice) {
                // ------------------------
                // 선택형/척도형 집계
                // ------------------------

                // ✅ 카운트 맵
                // - SCALE은 숫자(raw) 키로 통일하여 집계
                // - CHOICE/CHOICE_MULTI는 값 그대로 집계
                Map<String, Integer> countsByKey = new LinkedHashMap<>();

                if ("SCALE".equals(q.type())) {
                    // SCALE 응답값은 "1", "2"처럼 오는 경우가 많아 앞 숫자만 추출
                    for (String v : allValues) {
                        String key = extractLeadingNumber(v);
                        if (key == null) continue;
                        countsByKey.put(key, countsByKey.getOrDefault(key, 0) + 1);
                    }
                } else {
                    // CHOICE/CHOICE_MULTI는 값 자체가 보기 라벨(또는 값)인 경우가 많음
                    for (String v : allValues) {
                        countsByKey.put(v, countsByKey.getOrDefault(v, 0) + 1);
                    }
                }

                List<AnalyzeResultDto.OptionStat> optionStats = new ArrayList<>();

                if ("SCALE".equals(q.type())) {
                    // ✅ SCALE은 0 응답도 포함:
                    // FormDetailDto의 options(보기 목록) 순서대로 출력하면
                    // 점수 오름차순을 안정적으로 유지할 수 있다.
                    List<String> options = (q.options() == null) ? List.of() : q.options();

                    for (String opt : options) {
                        // opt가 "1 (라벨)" 형태면 앞 숫자를 키로 사용
                        String key = extractLeadingNumber(opt);
                        if (key == null) key = opt;

                        int count = countsByKey.getOrDefault(key, 0);
                        double rate = answeredCount == 0 ? 0.0 : round2((double) count * 100.0 / answeredCount);

                        // label은 보기 문자열 그대로(라벨 포함) 유지 → UI 표시 용이
                        optionStats.add(new AnalyzeResultDto.OptionStat(opt, count, rate));
                    }
                } else {
                    // ✅ CHOICE/CHOICE_MULTI는 “등장한 값”만 출력
                    // 많이 선택된 보기부터 보여주기 위해 count 내림차순 정렬
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
                // 주관식은 샘플 일부만 내려서 UI/성능을 보호
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

        // 4) 메타 + 요약 리스트로 최종 DTO 구성
        return new AnalyzeResultDto(
                new AnalyzeResultDto.Meta(formId, form.title(), total),
                summaries
        );
    }

    /**
     * 소수점 2자리 반올림
     * - 분석 UI에서 비율을 보기 좋게 표시하기 위한 목적
     */
    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    /**
     * 문자열 앞부분의 숫자만 추출
     *
     * [사용 이유]
     * - SCALE의 옵션 라벨은 "1 (매우 불만족)", "10 (매우 만족)"처럼 올 수 있고
     * - 실제 응답 값은 "1", "10"처럼 숫자만 오는 경우가 많다.
     * - 따라서 집계 매칭키를 "앞 숫자"로 통일해야 정확한 매칭이 가능하다.
     *
     * 예)
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
