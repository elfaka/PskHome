/**
 * survey 모듈 DTO — 기존 `survey/dto/*.java` 의 record 들과 1:1 대응.
 * 프론트(`FormsList.tsx`, `AnalyzePage.tsx`)가 그대로 소비하는 형태이므로 필드명을 바꾸지 않는다.
 */

/** 기존 `FormListItemDto` */
export interface FormListItem {
  formId: string;
  name: string;
  modifiedTime: string | null;
}

/** 정규화된 문항 타입 */
export type QuestionType =
  | "CHOICE"
  | "CHOICE_MULTI"
  | "SCALE"
  | "TEXT"
  | "UNKNOWN";

/** 기존 `FormDetailDto.QuestionDto` */
export interface FormQuestion {
  questionId: string;
  title: string;
  type: QuestionType;
  options: string[];
}

/** 기존 `FormDetailDto` */
export interface FormDetail {
  formId: string;
  title: string;
  questions: FormQuestion[];
}

/** 기존 `FormResponsesDto.FileDto` */
export interface AnswerFile {
  fileId: string | null;
  fileName: string | null;
  mimeType: string | null;
}

/** 기존 `FormResponsesDto.AnswerDto` */
export interface Answer {
  values: string[];
  files: AnswerFile[];
}

/** 기존 `FormResponsesDto.FormResponseDto` */
export interface FormResponse {
  responseId: string | null;
  createTime: string | null;
  lastSubmittedTime: string | null;
  answers: Record<string, Answer>;
}

/** 기존 `FormResponsesDto` */
export interface FormResponses {
  formId: string;
  nextPageToken: string | null;
  responses: FormResponse[];
}

/** 기존 `AnalyzeResultDto.OptionStat` */
export interface OptionStat {
  label: string;
  count: number;
  rate: number;
}

/** 기존 `AnalyzeResultDto.TextStat` */
export interface TextStat {
  count: number;
  samples: string[];
}

/** 기존 `AnalyzeResultDto.QuestionSummary` */
export interface QuestionSummary {
  questionId: string;
  questionTitle: string;
  type: QuestionType;
  options: OptionStat[];
  text: TextStat | null;
}

/** 기존 `AnalyzeResultDto` */
export interface AnalyzeResult {
  meta: {
    formId: string;
    title: string;
    analyzedResponses: number;
  };
  summaries: QuestionSummary[];
}

/** 응답 조회 limit 은 1~500 으로 제한한다 (응답이 매우 많은 설문 보호). */
export function clampPageSize(limit: number): number {
  return Math.min(Math.max(limit, 1), 500);
}
