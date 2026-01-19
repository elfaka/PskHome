package kr.elfaka.lostark.survey.dto;

import java.util.List;

/**
 * AnalyzeResultDto
 *
 * [역할]
 * - 특정 Google Form 하나에 대한 "분석 결과 전체"를 표현하는 DTO
 * - 설문 메타 정보 + 문항별 분석 요약을 함께 반환한다.
 *
 * [사용 위치]
 * - AnalyzeController.analyze()
 * - 프론트 AnalyzePage (분석 화면 렌더링)
 *
 * [설계 의도]
 * - 프론트가 Google Forms 원본 구조를 전혀 몰라도
 *   이 DTO 하나만으로 분석 UI를 완성할 수 있도록 설계
 */
public record AnalyzeResultDto(
        Meta meta,
        List<QuestionSummary> summaries
) {

    /**
     * Meta
     *
     * [역할]
     * - 분석 대상 설문의 기본 정보 및 분석 범위 메타 데이터
     *
     * @param formId             Google Form ID
     * @param title              설문 제목
     * @param analyzedResponses  이번 분석에 사용된 응답 수
     */
    public record Meta(
            String formId,
            String title,
            int analyzedResponses
    ) {}

    /**
     * QuestionSummary
     *
     * [역할]
     * - 설문 내 "개별 문항 하나"에 대한 분석 결과 요약
     *
     * [type 기준 분기]
     * - CHOICE / CHOICE_MULTI / SCALE :
     *     → options 필드 사용
     * - TEXT / UNKNOWN :
     *     → text 필드 사용
     *
     * @param questionId     문항 ID (FormDetailDto.QuestionDto.questionId)
     * @param questionTitle 문항 문구
     * @param type           문항 타입
     * @param options        선택형/척도형 분석 결과 (OptionStat 리스트)
     * @param text           주관식 분석 결과 (TextStat)
     */
    public record QuestionSummary(
            String questionId,
            String questionTitle,
            String type,
            List<OptionStat> options,
            TextStat text
    ) {}

    /**
     * OptionStat
     *
     * [역할]
     * - 선택형/척도형 문항의 "보기 하나"에 대한 집계 결과
     *
     * [count / rate 기준]
     * - count : 해당 보기를 선택한 횟수
     * - rate  : (count / 해당 문항에 실제 응답한 응답자 수) * 100
     *
     * ※ 전체 응답 수가 아닌 "문항 응답자 수"를 분모로 사용
     *    → 문항별 분석 정확도 향상
     *
     * @param label 보기 라벨 (SCALE의 경우 "1 (매우 불만족)" 등)
     * @param count 선택 횟수
     * @param rate  응답 비율(%)
     */
    public record OptionStat(
            String label,
            int count,
            double rate
    ) {}

    /**
     * TextStat
     *
     * [역할]
     * - 주관식(TEXT/UNKNOWN) 문항의 분석 결과
     *
     * [구성]
     * - count   : 전체 응답 수
     * - samples : 응답 샘플 일부 (UI/성능 보호 목적, 보통 20개 제한)
     *
     * @param count   주관식 응답 개수
     * @param samples 주관식 응답 샘플
     */
    public record TextStat(
            int count,
            List<String> samples
    ) {}
}
/*
“분석 결과 DTO를 문항 단위로 분리하고,
선택형과 주관식의 결과 구조를 명확히 나눠
프론트가 단순히 타입에 따라 렌더링만 하도록 설계했습니다.”
 */