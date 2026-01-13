package kr.elfaka.lostark.survey.service;

import kr.elfaka.lostark.survey.dto.*;
import kr.elfaka.lostark.survey.google.GoogleClientFactory;
import com.google.api.services.drive.model.FileList;
import com.google.api.services.forms.v1.model.Form;
import com.google.api.services.forms.v1.model.Item;
import com.google.api.services.forms.v1.model.Question;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class FormsService {

    private final GoogleClientFactory google;

    public FormsService(GoogleClientFactory google) {
        this.google = google;
    }

    public List<FormListItemDto> listMyForms(OAuth2AuthenticationToken auth) {
        try {
            var drive = google.drive(auth);

            String q = "mimeType='application/vnd.google-apps.form' and trashed=false";

            FileList list = drive.files().list()
                    .setQ(q)
                    .setFields("files(id,name,modifiedTime)")
                    .setPageSize(50)
                    .execute();

            if (list.getFiles() == null) return List.of();

            return list.getFiles().stream()
                    .map(f -> new FormListItemDto(
                            f.getId(),
                            f.getName(),
                            f.getModifiedTime() == null ? null : f.getModifiedTime().toStringRfc3339()
                    ))
                    .toList();

        } catch (Exception e) {
            throw new RuntimeException("Failed to list Google Forms from Drive", e);
        }
    }

    public FormDetailDto getFormDetail(OAuth2AuthenticationToken auth, String formId) {
        try {
            var forms = google.forms(auth);

            Form form = forms.forms().get(formId).execute();
            String title = (form.getInfo() != null && form.getInfo().getTitle() != null)
                    ? form.getInfo().getTitle()
                    : "(no title)";

            List<FormDetailDto.QuestionDto> questions = new ArrayList<>();

            if (form.getItems() != null) {
                for (Item item : form.getItems()) {

                    // 1) 일반 단일 문항 (QuestionItem)
                    if (item.getQuestionItem() != null && item.getQuestionItem().getQuestion() != null) {
                        Question q = item.getQuestionItem().getQuestion();

                        String qid = q.getQuestionId();
                        String qTitle = item.getTitle() != null ? item.getTitle() : "(no question title)";

                        ParsedQuestion parsed = parseSingleQuestion(q, qTitle);
                        questions.add(new FormDetailDto.QuestionDto(
                                qid,
                                parsed.title,
                                parsed.type,
                                parsed.options
                        ));
                        continue;
                    }

                    // 2) 그리드 문항 (QuestionGroupItem)
                    if (item.getQuestionGroupItem() != null) {
                        var group = item.getQuestionGroupItem();

                        // 그리드의 열 선택지
                        List<String> columnOptions = new ArrayList<>();
                        String gridChoiceType = null; // RADIO or CHECK_BOX

                        if (group.getGrid() != null && group.getGrid().getColumns() != null) {
                            var columns = group.getGrid().getColumns();
                            gridChoiceType = columns.getType(); // RADIO / CHECK_BOX
                            if (columns.getOptions() != null) {
                                columns.getOptions().forEach(opt -> {
                                    if (opt.getValue() != null) columnOptions.add(opt.getValue());
                                });
                            }
                        }

                        // 그리드 전체 제목
                        String groupTitle = item.getTitle() != null ? item.getTitle() : "(grid)";

                        // 각 행(row)은 별도 questionId를 가진 Question(RowQuestion)
                        if (group.getQuestions() != null) {
                            for (Question rowQ : group.getQuestions()) {
                                String rowQid = rowQ.getQuestionId();

                                String rowTitle = (rowQ.getRowQuestion() != null && rowQ.getRowQuestion().getTitle() != null)
                                        ? rowQ.getRowQuestion().getTitle()
                                        : "(row)";

                                String flattenedTitle = groupTitle + " - " + rowTitle;

                                // 요구사항:
                                // - 객관식 그리드(RADIO): 행별 CHOICE (단일객관식처럼)
                                // - 체크박스 그리드(CHECK_BOX): 행별 CHOICE_MULTI (복수객관식처럼)
                                String flattenedType =
                                        "CHECK_BOX".equalsIgnoreCase(gridChoiceType) ? "CHOICE_MULTI" : "CHOICE";

                                questions.add(new FormDetailDto.QuestionDto(
                                        rowQid,
                                        flattenedTitle,
                                        flattenedType,
                                        columnOptions
                                ));
                            }
                        }
                    }
                }
            }

            return new FormDetailDto(formId, title, questions);

        } catch (Exception e) {
            throw new RuntimeException("Failed to get form detail from Forms API", e);
        }
    }

    private static class ParsedQuestion {
        final String title;
        final String type;
        final List<String> options;

        ParsedQuestion(String title, String type, List<String> options) {
            this.title = title;
            this.type = type;
            this.options = options;
        }
    }

    private ParsedQuestion parseSingleQuestion(Question q, String qTitle) {
        // 1) ChoiceQuestion → CHOICE
        if (q.getChoiceQuestion() != null) {
            List<String> options = new ArrayList<>();
            var cq = q.getChoiceQuestion();
            if (cq.getOptions() != null) {
                cq.getOptions().forEach(opt -> {
                    if (opt.getValue() != null) options.add(opt.getValue());
                });
            }
            return new ParsedQuestion(qTitle, "CHOICE", options);
        }

        // 2) TextQuestion → TEXT
        if (q.getTextQuestion() != null) {
            return new ParsedQuestion(qTitle, "TEXT", List.of());
        }

        // 3) Date/Time → TEXT
        if (q.getDateQuestion() != null) {
            return new ParsedQuestion(qTitle, "TEXT", List.of());
        }
        if (q.getTimeQuestion() != null) {
            return new ParsedQuestion(qTitle, "TEXT", List.of());
        }

        // ✅ 4) Linear scale(선형 배율) → SCALE
        // ScaleQuestion: low/high + lowLabel/highLabel 이 존재
        if (q.getScaleQuestion() != null) {
            var sq = q.getScaleQuestion();

            int low = sq.getLow() != null ? sq.getLow() : 1;
            int high = sq.getHigh() != null ? sq.getHigh() : low;

            String lowLabel = sq.getLowLabel() != null ? sq.getLowLabel() : "";
            String highLabel = sq.getHighLabel() != null ? sq.getHighLabel() : "";

            List<String> options = new ArrayList<>();
            for (int i = low; i <= high; i++) {
                // 라벨은 양 끝만 붙여서 UI에서 보기 좋게
                if (i == low && !lowLabel.isBlank()) {
                    options.add(i + " (" + lowLabel + ")");
                } else if (i == high && !highLabel.isBlank()) {
                    options.add(i + " (" + highLabel + ")");
                } else {
                    options.add(String.valueOf(i));
                }
            }

            return new ParsedQuestion(qTitle, "SCALE", options);
        }

        return new ParsedQuestion(qTitle, "UNKNOWN", List.of());
    }


    /**
     * Forms API로 설문 응답 가져오기 (Forms Responses)
     * - 선택형/주관식 모두 textAnswers로 문자열 values가 내려오는 경우가 일반적
     * - 파일 업로드 문항은 fileUploadAnswers
     */
    public FormResponsesDto listResponses(OAuth2AuthenticationToken auth, String formId, int pageSize, String pageToken) {
        try {
            var forms = google.forms(auth);

            var req = forms.forms().responses().list(formId)
                    .setPageSize(pageSize);

            if (pageToken != null && !pageToken.isBlank()) {
                req.setPageToken(pageToken);
            }

            var resp = req.execute();

            var outResponses = new ArrayList<FormResponsesDto.FormResponseDto>();

            if (resp.getResponses() != null) {
                for (var r : resp.getResponses()) {
                    java.util.Map<String, FormResponsesDto.AnswerDto> mapped = new java.util.HashMap<>();

                    if (r.getAnswers() != null) {
                        for (var entry : r.getAnswers().entrySet()) {
                            String questionId = entry.getKey();
                            var ans = entry.getValue();

                            List<String> values = new ArrayList<>();
                            List<FormResponsesDto.FileDto> files = new ArrayList<>();

                            // ✅ 문자열 답변(선택형/주관식 포함)
                            if (ans.getTextAnswers() != null && ans.getTextAnswers().getAnswers() != null) {
                                for (var ta : ans.getTextAnswers().getAnswers()) {
                                    if (ta.getValue() != null) values.add(ta.getValue());
                                }
                            }

                            // ✅ 파일 업로드
                            if (ans.getFileUploadAnswers() != null && ans.getFileUploadAnswers().getAnswers() != null) {
                                for (var fa : ans.getFileUploadAnswers().getAnswers()) {
                                    files.add(new FormResponsesDto.FileDto(
                                            fa.getFileId(),
                                            fa.getFileName(),
                                            fa.getMimeType()
                                    ));
                                }
                            }

                            mapped.put(questionId, new FormResponsesDto.AnswerDto(values, files));
                        }
                    }

                    outResponses.add(new FormResponsesDto.FormResponseDto(
                            r.getResponseId(),
                            r.getCreateTime(),
                            r.getLastSubmittedTime(),
                            mapped
                    ));
                }
            }

            return new FormResponsesDto(
                    formId,
                    resp.getNextPageToken(),
                    outResponses
            );

        } catch (Exception e) {
            throw new RuntimeException("Failed to list form responses via Forms API", e);
        }
    }
}