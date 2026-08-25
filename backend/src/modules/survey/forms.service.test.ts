import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Google API 호출을 mock 하고, 응답 정규화 로직만 검증한다.
 * (기존 Java 에는 이 부분 테스트가 없었지만, 파싱 규칙이 분석 결과를 좌우하므로 추가한다)
 */
const holder = vi.hoisted(() => ({
  drive: null as unknown,
  forms: null as unknown,
}));

vi.mock("./google/googleClientFactory.js", async () => {
  const { HttpError } = await import("../../lib/httpError.js");

  return {
    driveClient: () => holder.drive,
    formsClient: () => holder.forms,
    toHttpError: (error: unknown, message: string) =>
      HttpError.internal(
        `${message}: ${error instanceof Error ? error.message : String(error)}`
      ),
  };
});

const { getFormDetail, listMyForms, listResponses } = await import(
  "./forms.service.js"
);

const user: Express.User = {
  id: "sub-1",
  name: "Tester",
  accessToken: "token",
};

describe("listMyForms", () => {
  it("maps drive files to form list items", async () => {
    holder.drive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [
              { id: "f1", name: "설문 1", modifiedTime: "2024-05-01T00:00:00Z" },
              { id: "f2", name: "설문 2", modifiedTime: null },
            ],
          },
        }),
      },
    };

    const result = await listMyForms(user);

    expect(result).toEqual([
      { formId: "f1", name: "설문 1", modifiedTime: "2024-05-01T00:00:00Z" },
      { formId: "f2", name: "설문 2", modifiedTime: null },
    ]);
  });

  it("queries only non-trashed google forms", async () => {
    const list = vi.fn().mockResolvedValue({ data: { files: [] } });
    holder.drive = { files: { list } };

    await listMyForms(user);

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "mimeType='application/vnd.google-apps.form' and trashed=false",
        pageSize: 50,
      })
    );
  });

  it("returns an empty list when drive returns no files", async () => {
    holder.drive = {
      files: { list: vi.fn().mockResolvedValue({ data: {} }) },
    };

    expect(await listMyForms(user)).toEqual([]);
  });
});

describe("getFormDetail", () => {
  function mockForm(form: unknown) {
    holder.forms = {
      forms: {
        get: vi.fn().mockResolvedValue({ data: form }),
        responses: { list: vi.fn() },
      },
    };
  }

  it("falls back to a placeholder title", async () => {
    mockForm({ items: [] });

    const detail = await getFormDetail(user, "form-1");

    expect(detail.title).toBe("(no title)");
    expect(detail.formId).toBe("form-1");
  });

  it("normalizes a choice question", async () => {
    mockForm({
      info: { title: "설문" },
      items: [
        {
          title: "좋아하는 색은?",
          questionItem: {
            question: {
              questionId: "q1",
              choiceQuestion: {
                options: [{ value: "빨강" }, { value: "파랑" }, {}],
              },
            },
          },
        },
      ],
    });

    const detail = await getFormDetail(user, "form-1");

    expect(detail.questions).toEqual([
      {
        questionId: "q1",
        title: "좋아하는 색은?",
        type: "CHOICE",
        options: ["빨강", "파랑"],
      },
    ]);
  });

  it("treats text, date and time questions as TEXT", async () => {
    mockForm({
      items: [
        {
          title: "자유 의견",
          questionItem: { question: { questionId: "q1", textQuestion: {} } },
        },
        {
          title: "날짜",
          questionItem: { question: { questionId: "q2", dateQuestion: {} } },
        },
        {
          title: "시간",
          questionItem: { question: { questionId: "q3", timeQuestion: {} } },
        },
      ],
    });

    const detail = await getFormDetail(user, "form-1");

    expect(detail.questions.map((q) => q.type)).toEqual([
      "TEXT",
      "TEXT",
      "TEXT",
    ]);
    expect(detail.questions[0].options).toEqual([]);
  });

  it("expands a scale question into labelled options", async () => {
    mockForm({
      items: [
        {
          title: "만족도",
          questionItem: {
            question: {
              questionId: "q1",
              scaleQuestion: {
                low: 1,
                high: 5,
                lowLabel: "매우 불만",
                highLabel: "매우 만족",
              },
            },
          },
        },
      ],
    });

    const detail = await getFormDetail(user, "form-1");

    expect(detail.questions[0].type).toBe("SCALE");
    expect(detail.questions[0].options).toEqual([
      "1 (매우 불만)",
      "2",
      "3",
      "4",
      "5 (매우 만족)",
    ]);
  });

  it("omits scale labels when they are blank", async () => {
    mockForm({
      items: [
        {
          title: "점수",
          questionItem: {
            question: {
              questionId: "q1",
              scaleQuestion: { low: 1, high: 3, lowLabel: "", highLabel: "  " },
            },
          },
        },
      ],
    });

    const detail = await getFormDetail(user, "form-1");

    expect(detail.questions[0].options).toEqual(["1", "2", "3"]);
  });

  it("marks unrecognised question kinds as UNKNOWN", async () => {
    mockForm({
      items: [
        {
          title: "파일 업로드",
          questionItem: {
            question: { questionId: "q1", fileUploadQuestion: {} },
          },
        },
      ],
    });

    const detail = await getFormDetail(user, "form-1");

    expect(detail.questions[0].type).toBe("UNKNOWN");
  });

  it("flattens a radio grid into one question per row", async () => {
    mockForm({
      items: [
        {
          title: "서비스 평가",
          questionGroupItem: {
            grid: {
              columns: {
                type: "RADIO",
                options: [{ value: "좋음" }, { value: "나쁨" }],
              },
            },
            questions: [
              { questionId: "r1", rowQuestion: { title: "속도" } },
              { questionId: "r2", rowQuestion: { title: "가격" } },
            ],
          },
        },
      ],
    });

    const detail = await getFormDetail(user, "form-1");

    expect(detail.questions).toEqual([
      {
        questionId: "r1",
        title: "서비스 평가 - 속도",
        type: "CHOICE",
        options: ["좋음", "나쁨"],
      },
      {
        questionId: "r2",
        title: "서비스 평가 - 가격",
        type: "CHOICE",
        options: ["좋음", "나쁨"],
      },
    ]);
  });

  it("flattens a checkbox grid as CHOICE_MULTI", async () => {
    mockForm({
      items: [
        {
          title: "복수 선택",
          questionGroupItem: {
            grid: { columns: { type: "CHECK_BOX", options: [{ value: "A" }] } },
            questions: [{ questionId: "r1", rowQuestion: { title: "행" } }],
          },
        },
      ],
    });

    const detail = await getFormDetail(user, "form-1");

    expect(detail.questions[0].type).toBe("CHOICE_MULTI");
  });
});

describe("listResponses", () => {
  let list: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    list = vi.fn().mockResolvedValue({ data: {} });
    holder.forms = { forms: { get: vi.fn(), responses: { list } } };
  });

  it("normalizes answers into a questionId keyed map", async () => {
    list.mockResolvedValue({
      data: {
        nextPageToken: "next",
        responses: [
          {
            responseId: "resp-1",
            createTime: "2024-01-01T00:00:00Z",
            lastSubmittedTime: "2024-01-02T00:00:00Z",
            answers: {
              q1: { textAnswers: { answers: [{ value: "예" }, {}] } },
              q2: {
                fileUploadAnswers: {
                  answers: [
                    { fileId: "file-1", fileName: "a.png", mimeType: "image/png" },
                  ],
                },
              },
            },
          },
        ],
      },
    });

    const result = await listResponses(user, "form-1", 50, null);

    expect(result.formId).toBe("form-1");
    expect(result.nextPageToken).toBe("next");
    expect(result.responses).toHaveLength(1);
    expect(result.responses[0].answers.q1).toEqual({
      values: ["예"],
      files: [],
    });
    expect(result.responses[0].answers.q2).toEqual({
      values: [],
      files: [
        { fileId: "file-1", fileName: "a.png", mimeType: "image/png" },
      ],
    });
  });

  it("passes the page token through only when present", async () => {
    await listResponses(user, "form-1", 25, null);
    expect(list).toHaveBeenCalledWith({ formId: "form-1", pageSize: 25 });

    await listResponses(user, "form-1", 25, "token-1");
    expect(list).toHaveBeenLastCalledWith({
      formId: "form-1",
      pageSize: 25,
      pageToken: "token-1",
    });
  });

  it("returns an empty response list when the form has no responses", async () => {
    const result = await listResponses(user, "form-1", 50, null);

    expect(result.responses).toEqual([]);
    expect(result.nextPageToken).toBeNull();
  });
});
