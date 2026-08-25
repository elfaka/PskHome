import type { forms_v1 } from "googleapis";

import {
  driveClient,
  formsClient,
  toHttpError,
} from "./google/googleClientFactory.js";
import type {
  Answer,
  AnswerFile,
  FormDetail,
  FormListItem,
  FormQuestion,
  FormResponse,
  FormResponses,
  QuestionType,
} from "./survey.types.js";

/**
 * Google Forms/Drive 연동 — 기존 `survey/service/FormsService.java`
 *
 * 컨트롤러는 얇게 유지하고, Google API 호출과 응답 정규화를 전부 여기서 처리한다.
 */

/** 로그인한 사용자의 Google Forms 목록 (최대 50개). */
export async function listMyForms(
  user: Express.User
): Promise<FormListItem[]> {
  try {
    const drive = driveClient(user);

    const res = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.form' and trashed=false",
      fields: "files(id,name,modifiedTime)",
      pageSize: 50,
    });

    const files = res.data.files ?? [];

    return files.map((f) => ({
      formId: f.id ?? "",
      name: f.name ?? "",
      modifiedTime: f.modifiedTime ?? null,
    }));
  } catch (e) {
    throw toHttpError(e, "Failed to list Google Forms from Drive");
  }
}

/**
 * 설문 상세 — 문항을 "분석하기 쉬운 평평한 목록"으로 정규화한다.
 *
 * - 그리드(questionGroupItem) 문항은 row 단위로 flatten 해서 하나의 문항처럼 다룬다.
 * - 문항 타입은 CHOICE / CHOICE_MULTI / SCALE / TEXT / UNKNOWN 으로 정규화해
 *   프론트가 타입 분기만으로 렌더링할 수 있게 한다.
 */
export async function getFormDetail(
  user: Express.User,
  formId: string
): Promise<FormDetail> {
  try {
    const forms = formsClient(user);

    const res = await forms.forms.get({ formId });
    const form = res.data;

    const title = form.info?.title ?? "(no title)";
    const questions: FormQuestion[] = [];

    for (const item of form.items ?? []) {
      const question = item.questionItem?.question;

      if (question) {
        const questionTitle = item.title ?? "(no question title)";
        const parsed = parseSingleQuestion(question, questionTitle);

        questions.push({
          questionId: question.questionId ?? "",
          title: parsed.title,
          type: parsed.type,
          options: parsed.options,
        });
        continue;
      }

      const group = item.questionGroupItem;
      if (!group) continue;

      const columns = group.grid?.columns;
      const gridChoiceType = columns?.type ?? null;
      const columnOptions = (columns?.options ?? [])
        .map((opt) => opt.value)
        .filter((v): v is string => v != null);

      const groupTitle = item.title ?? "(grid)";
      const flattenedType: QuestionType =
        gridChoiceType?.toUpperCase() === "CHECK_BOX" ? "CHOICE_MULTI" : "CHOICE";

      for (const rowQuestion of group.questions ?? []) {
        const rowTitle = rowQuestion.rowQuestion?.title ?? "(row)";

        questions.push({
          questionId: rowQuestion.questionId ?? "",
          title: `${groupTitle} - ${rowTitle}`,
          type: flattenedType,
          options: columnOptions,
        });
      }
    }

    return { formId, title, questions };
  } catch (e) {
    throw toHttpError(e, "Failed to get form detail from Forms API");
  }
}

interface ParsedQuestion {
  title: string;
  type: QuestionType;
  options: string[];
}

function parseSingleQuestion(
  question: forms_v1.Schema$Question,
  title: string
): ParsedQuestion {
  if (question.choiceQuestion) {
    const options = (question.choiceQuestion.options ?? [])
      .map((opt) => opt.value)
      .filter((v): v is string => v != null);

    return { title, type: "CHOICE", options };
  }

  // 날짜/시간 문항은 분석 관점에서 주관식과 동일하게 다룬다.
  if (question.textQuestion || question.dateQuestion || question.timeQuestion) {
    return { title, type: "TEXT", options: [] };
  }

  if (question.scaleQuestion) {
    const scale = question.scaleQuestion;

    const low = scale.low ?? 1;
    const high = scale.high ?? low;
    const lowLabel = scale.lowLabel ?? "";
    const highLabel = scale.highLabel ?? "";

    const options: string[] = [];
    for (let i = low; i <= high; i++) {
      if (i === low && lowLabel.trim().length > 0) {
        options.push(`${i} (${lowLabel})`);
      } else if (i === high && highLabel.trim().length > 0) {
        options.push(`${i} (${highLabel})`);
      } else {
        options.push(String(i));
      }
    }

    return { title, type: "SCALE", options };
  }

  return { title, type: "UNKNOWN", options: [] };
}

/**
 * 설문 응답 목록.
 *
 * Google 의 응답 구조를 questionId 기준 Map 으로 정규화해
 * 문항별 집계 로직을 단순하게 만든다.
 */
export async function listResponses(
  user: Express.User,
  formId: string,
  pageSize: number,
  pageToken?: string | null
): Promise<FormResponses> {
  try {
    const forms = formsClient(user);

    const res = await forms.forms.responses.list({
      formId,
      pageSize,
      ...(pageToken && pageToken.trim().length > 0 ? { pageToken } : {}),
    });

    const responses: FormResponse[] = (res.data.responses ?? []).map((r) =>
      toFormResponse(r)
    );

    return {
      formId,
      nextPageToken: res.data.nextPageToken ?? null,
      responses,
    };
  } catch (e) {
    throw toHttpError(e, "Failed to list form responses via Forms API");
  }
}

function toFormResponse(
  response: forms_v1.Schema$FormResponse
): FormResponse {
  const answers: Record<string, Answer> = {};

  for (const [questionId, answer] of Object.entries(response.answers ?? {})) {
    const values = (answer.textAnswers?.answers ?? [])
      .map((a) => a.value)
      .filter((v): v is string => v != null);

    const files: AnswerFile[] = (answer.fileUploadAnswers?.answers ?? []).map(
      (f) => ({
        fileId: f.fileId ?? null,
        fileName: f.fileName ?? null,
        mimeType: f.mimeType ?? null,
      })
    );

    answers[questionId] = { values, files };
  }

  return {
    responseId: response.responseId ?? null,
    createTime: response.createTime ?? null,
    lastSubmittedTime: response.lastSubmittedTime ?? null,
    answers,
  };
}
