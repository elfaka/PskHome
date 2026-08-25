import * as formsService from "./forms.service.js";
import {
  clampPageSize,
  type AnalyzeResult,
  type OptionStat,
  type QuestionSummary,
} from "./survey.types.js";

/**
 * 설문 응답 분석 — 기존 `survey/service/AnalyzeService.java`
 *
 * 단순 응답 나열이 아니라 문항별 집계 결과를 돌려주어,
 * 프론트가 타입에 따라 렌더링만 하면 되도록 만든다.
 */
export async function analyze(
  user: Express.User,
  formId: string,
  limit: number
): Promise<AnalyzeResult> {
  const form = await formsService.getFormDetail(user, formId);

  const pageSize = clampPageSize(limit);
  const { responses } = await formsService.listResponses(
    user,
    formId,
    pageSize,
    null
  );

  const analyzedResponses = responses.length;
  const summaries: QuestionSummary[] = [];

  for (const question of form.questions) {
    const questionId = question.questionId;

    // 응답률의 분모는 전체 응답 수가 아니라 "이 문항에 답한 응답 수" 다.
    let answeredCount = 0;
    const allValues: string[] = [];

    for (const response of responses) {
      const answer = response.answers?.[questionId];
      if (!answer?.values) continue;

      let hasAny = false;

      for (const value of answer.values) {
        if (value != null && value.trim().length > 0) {
          hasAny = true;
          allValues.push(value.trim());
        }
      }

      if (hasAny) answeredCount++;
    }

    const isChoice =
      question.type === "CHOICE" ||
      question.type === "CHOICE_MULTI" ||
      question.type === "SCALE";

    if (!isChoice) {
      summaries.push({
        questionId,
        questionTitle: question.title,
        type: question.type,
        options: [],
        text: { count: allValues.length, samples: allValues.slice(0, 20) },
      });
      continue;
    }

    const countsByKey = new Map<string, number>();

    if (question.type === "SCALE") {
      // 척도 문항은 "3 (보통)" 같은 라벨이 오므로 선행 숫자만 집계 키로 쓴다.
      for (const value of allValues) {
        const key = extractLeadingNumber(value);
        if (key == null) continue;
        countsByKey.set(key, (countsByKey.get(key) ?? 0) + 1);
      }
    } else {
      for (const value of allValues) {
        countsByKey.set(value, (countsByKey.get(value) ?? 0) + 1);
      }
    }

    const options: OptionStat[] = [];

    if (question.type === "SCALE") {
      // 척도는 응답이 0건인 보기도 정의된 순서대로 모두 노출한다.
      for (const option of question.options ?? []) {
        const key = extractLeadingNumber(option) ?? option;
        const count = countsByKey.get(key) ?? 0;

        options.push({
          label: option,
          count,
          rate: answeredCount === 0 ? 0 : round2((count * 100) / answeredCount),
        });
      }
    } else {
      // 객관식은 응답이 많은 보기부터 보여준다.
      const sorted = [...countsByKey.entries()].sort((a, b) => b[1] - a[1]);

      for (const [label, count] of sorted) {
        options.push({
          label,
          count,
          rate: answeredCount === 0 ? 0 : round2((count * 100) / answeredCount),
        });
      }
    }

    summaries.push({
      questionId,
      questionTitle: question.title,
      type: question.type,
      options,
      text: null,
    });
  }

  return {
    meta: { formId, title: form.title, analyzedResponses },
    summaries,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 문자열 앞부분의 연속된 숫자만 추출한다. ("3 (보통)" → "3") */
function extractLeadingNumber(value: string | null | undefined): string | null {
  if (value == null) return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const match = trimmed.match(/^\d+/);
  return match ? match[0] : null;
}
