import { describe, it, expect, vi } from "vitest";

import type {
  FormDetail,
  FormResponse,
  FormResponses,
} from "./survey.types.js";

/**
 * 집계 규칙 검증. Google API 는 forms.service 를 통째로 mock 해 차단한다.
 */
const holder = vi.hoisted(() => ({
  detail: null as unknown,
  responses: null as unknown,
  lastListArgs: null as unknown,
}));

vi.mock("./forms.service.js", () => ({
  getFormDetail: async () => holder.detail,
  listResponses: async (
    _user: unknown,
    _formId: string,
    pageSize: number,
    pageToken: string | null
  ) => {
    holder.lastListArgs = { pageSize, pageToken };
    return holder.responses;
  },
}));

const { analyze } = await import("./analyze.service.js");

const user: Express.User = { id: "sub", name: "Tester", accessToken: "t" };

function setup(detail: FormDetail, responses: FormResponse[]) {
  holder.detail = detail;
  holder.responses = {
    formId: detail.formId,
    nextPageToken: null,
    responses,
  } satisfies FormResponses;
}

function answer(values: string[]) {
  return { values, files: [] };
}

function response(answers: Record<string, string[]>): FormResponse {
  return {
    responseId: "r",
    createTime: null,
    lastSubmittedTime: null,
    answers: Object.fromEntries(
      Object.entries(answers).map(([k, v]) => [k, answer(v)])
    ),
  };
}

describe("analyze", () => {
  it("reports meta with the analyzed response count", async () => {
    setup(
      { formId: "f1", title: "설문", questions: [] },
      [response({}), response({})]
    );

    const result = await analyze(user, "f1", 200);

    expect(result.meta).toEqual({
      formId: "f1",
      title: "설문",
      analyzedResponses: 2,
    });
  });

  it("sorts choice options by descending count", async () => {
    setup(
      {
        formId: "f1",
        title: "설문",
        questions: [
          { questionId: "q1", title: "색", type: "CHOICE", options: [] },
        ],
      },
      [
        response({ q1: ["빨강"] }),
        response({ q1: ["파랑"] }),
        response({ q1: ["파랑"] }),
      ]
    );

    const result = await analyze(user, "f1", 200);

    expect(result.summaries[0].options).toEqual([
      { label: "파랑", count: 2, rate: 66.67 },
      { label: "빨강", count: 1, rate: 33.33 },
    ]);
    expect(result.summaries[0].text).toBeNull();
  });

  it("uses the answered count as the rate denominator, not the response count", async () => {
    setup(
      {
        formId: "f1",
        title: "설문",
        questions: [
          { questionId: "q1", title: "색", type: "CHOICE", options: [] },
        ],
      },
      [
        response({ q1: ["빨강"] }),
        // 이 응답자는 q1 에 답하지 않았다 → 분모에서 빠져야 한다
        response({ q2: ["무관"] }),
      ]
    );

    const result = await analyze(user, "f1", 200);

    expect(result.meta.analyzedResponses).toBe(2);
    expect(result.summaries[0].options).toEqual([
      { label: "빨강", count: 1, rate: 100 },
    ]);
  });

  it("ignores blank answers", async () => {
    setup(
      {
        formId: "f1",
        title: "설문",
        questions: [
          { questionId: "q1", title: "색", type: "CHOICE", options: [] },
        ],
      },
      [response({ q1: ["   "] }), response({ q1: ["빨강"] })]
    );

    const result = await analyze(user, "f1", 200);

    expect(result.summaries[0].options).toEqual([
      { label: "빨강", count: 1, rate: 100 },
    ]);
  });

  it("keeps scale options in their defined order including zero counts", async () => {
    setup(
      {
        formId: "f1",
        title: "설문",
        questions: [
          {
            questionId: "q1",
            title: "만족도",
            type: "SCALE",
            options: ["1 (낮음)", "2", "3 (높음)"],
          },
        ],
      },
      [response({ q1: ["3"] }), response({ q1: ["1"] }), response({ q1: ["3"] })]
    );

    const result = await analyze(user, "f1", 200);

    expect(result.summaries[0].options).toEqual([
      { label: "1 (낮음)", count: 1, rate: 33.33 },
      { label: "2", count: 0, rate: 0 },
      { label: "3 (높음)", count: 2, rate: 66.67 },
    ]);
  });

  it("matches scale answers by their leading number", async () => {
    setup(
      {
        formId: "f1",
        title: "설문",
        questions: [
          {
            questionId: "q1",
            title: "만족도",
            type: "SCALE",
            options: ["1 (낮음)", "2"],
          },
        ],
      },
      // 응답이 라벨 전체로 들어와도 선행 숫자로 매칭돼야 한다
      [response({ q1: ["1 (낮음)"] })]
    );

    const result = await analyze(user, "f1", 200);

    expect(result.summaries[0].options[0].count).toBe(1);
  });

  it("counts every selected value for multi-choice questions", async () => {
    setup(
      {
        formId: "f1",
        title: "설문",
        questions: [
          { questionId: "q1", title: "취미", type: "CHOICE_MULTI", options: [] },
        ],
      },
      [response({ q1: ["독서", "운동"] }), response({ q1: ["독서"] })]
    );

    const result = await analyze(user, "f1", 200);

    // 응답자 2명이 분모, 독서 2회 / 운동 1회
    expect(result.summaries[0].options).toEqual([
      { label: "독서", count: 2, rate: 100 },
      { label: "운동", count: 1, rate: 50 },
    ]);
  });

  it("summarizes text questions with at most 20 samples", async () => {
    const responses = Array.from({ length: 25 }, (_, i) =>
      response({ q1: [`의견 ${i}`] })
    );

    setup(
      {
        formId: "f1",
        title: "설문",
        questions: [
          { questionId: "q1", title: "의견", type: "TEXT", options: [] },
        ],
      },
      responses
    );

    const result = await analyze(user, "f1", 200);

    expect(result.summaries[0].options).toEqual([]);
    expect(result.summaries[0].text?.count).toBe(25);
    expect(result.summaries[0].text?.samples).toHaveLength(20);
    expect(result.summaries[0].text?.samples[0]).toBe("의견 0");
  });

  it("reports zero rates when nobody answered a question", async () => {
    setup(
      {
        formId: "f1",
        title: "설문",
        questions: [
          {
            questionId: "q1",
            title: "만족도",
            type: "SCALE",
            options: ["1", "2"],
          },
        ],
      },
      [response({})]
    );

    const result = await analyze(user, "f1", 200);

    expect(result.summaries[0].options).toEqual([
      { label: "1", count: 0, rate: 0 },
      { label: "2", count: 0, rate: 0 },
    ]);
  });

  it("clamps the requested limit to 1..500", async () => {
    setup({ formId: "f1", title: "설문", questions: [] }, []);

    await analyze(user, "f1", 10_000);
    expect(holder.lastListArgs).toEqual({ pageSize: 500, pageToken: null });

    await analyze(user, "f1", 0);
    expect(holder.lastListArgs).toEqual({ pageSize: 1, pageToken: null });
  });
});
