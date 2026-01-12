package kr.elfaka.lostark.survey.service;

import kr.elfaka.lostark.survey.dto.FormDetailDto;
import kr.elfaka.lostark.survey.dto.FormListItemDto;
import kr.elfaka.lostark.survey.dto.ResponsePreviewDto;
import kr.elfaka.lostark.survey.dto.SpreadsheetCandidateDto;
import kr.elfaka.lostark.survey.dto.FormResponsesDto;
import kr.elfaka.lostark.survey.google.GoogleClientFactory;
import com.google.api.client.googleapis.json.GoogleJsonResponseException;
import com.google.api.services.drive.model.File;
import com.google.api.services.drive.model.FileList;
import com.google.api.services.forms.v1.model.Form;
import com.google.api.services.sheets.v4.model.ValueRange;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.stereotype.Service;

import java.util.*;

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
                form.getItems().forEach(item -> {
                    if (item.getQuestionItem() == null) return;
                    if (item.getQuestionItem().getQuestion() == null) return;

                    String qid = item.getQuestionItem().getQuestion().getQuestionId();
                    String qTitle = item.getTitle() != null ? item.getTitle() : "(no question title)";

                    String type = "UNKNOWN";
                    List<String> options = new ArrayList<>();

                    var q = item.getQuestionItem().getQuestion();

                    if (q.getChoiceQuestion() != null) {
                        type = "CHOICE";
                        var cq = q.getChoiceQuestion();
                        if (cq.getOptions() != null) {
                            cq.getOptions().forEach(opt -> {
                                if (opt.getValue() != null) options.add(opt.getValue());
                            });
                        }
                    } else if (q.getTextQuestion() != null) {
                        type = "TEXT";
                    }

                    questions.add(new FormDetailDto.QuestionDto(qid, qTitle, type, options));
                });
            }

            return new FormDetailDto(formId, title, questions);

        } catch (Exception e) {
            throw new RuntimeException("Failed to get form detail from Forms API", e);
        }
    }

    /** Step 2-4: 폼 제목 기반으로 “응답 시트 후보 스프레드시트” 리스트 반환 */
    public List<SpreadsheetCandidateDto> listResponseSpreadsheets(OAuth2AuthenticationToken auth, String formId) {
        try {
            // 1) 폼 제목
            var forms = google.forms(auth);
            Form form = forms.forms().get(formId).execute();
            String formTitle = (form.getInfo() != null && form.getInfo().getTitle() != null)
                    ? form.getInfo().getTitle()
                    : "(no title)";

            // 2) Drive에서 spreadsheet 후보 찾기 (휴리스틱)
            var drive = google.drive(auth);
            String escaped = formTitle.replace("'", "\\'");
            String q = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and name contains '" + escaped + "'";

            FileList list = drive.files().list()
                    .setQ(q)
                    .setFields("files(id,name,modifiedTime)")
                    .setPageSize(20)
                    .execute();

            if (list.getFiles() == null || list.getFiles().isEmpty()) {
                return List.of();
            }

            // 최신 수정 우선 정렬
            return list.getFiles().stream()
                    .sorted((a, b) -> Long.compare(
                            b.getModifiedTime() == null ? 0L : b.getModifiedTime().getValue(),
                            a.getModifiedTime() == null ? 0L : a.getModifiedTime().getValue()
                    ))
                    .map(f -> new SpreadsheetCandidateDto(
                            f.getId(),
                            f.getName(),
                            f.getModifiedTime() == null ? null : f.getModifiedTime().toStringRfc3339()
                    ))
                    .toList();

        } catch (Exception e) {
            throw new RuntimeException("Failed to list response spreadsheets", e);
        }
    }

    /**
     * Step 2-3/2-4: 응답 프리뷰
     * - spreadsheetId가 있으면 그걸 사용
     * - 없으면 후보 중 “최신 수정” 1개 자동 선택
     */
    public ResponsePreviewDto previewResponses(OAuth2AuthenticationToken auth, String formId, String spreadsheetId, int limitRows) {
        try {
            // 1) 폼 타이틀
            var forms = google.forms(auth);
            Form form = forms.forms().get(formId).execute();
            String formTitle = (form.getInfo() != null && form.getInfo().getTitle() != null)
                    ? form.getInfo().getTitle()
                    : "(no title)";

            String chosenSpreadsheetId = spreadsheetId;
            String chosenSpreadsheetName = null;

            // 2) spreadsheetId가 없으면 자동 선택
            if (chosenSpreadsheetId == null || chosenSpreadsheetId.isBlank()) {
                var drive = google.drive(auth);
                String escaped = formTitle.replace("'", "\\'");
                String q = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and name contains '" + escaped + "'";

                FileList list = drive.files().list()
                        .setQ(q)
                        .setFields("files(id,name,modifiedTime)")
                        .setPageSize(10)
                        .execute();

                if (list.getFiles() == null || list.getFiles().isEmpty()) {
                    throw new IllegalStateException(
                            "응답 스프레드시트를 찾지 못했습니다. 폼에서 '응답을 스프레드시트에 저장'을 연결했는지 확인하세요."
                    );
                }

                File best = list.getFiles().stream()
                        .max(Comparator.comparingLong(f -> f.getModifiedTime() == null ? 0L : f.getModifiedTime().getValue()))
                        .orElseThrow();

                chosenSpreadsheetId = best.getId();
                chosenSpreadsheetName = best.getName();
            } else {
                // 3) spreadsheetId가 있으면 이름 조회(선택)
                var drive = google.drive(auth);
                File f = drive.files().get(chosenSpreadsheetId)
                        .setFields("id,name")
                        .execute();
                chosenSpreadsheetName = f.getName();
            }

            // 4) Sheets로 프리뷰 읽기
            var sheets = google.sheets(auth);
            ValueRange vr = sheets.spreadsheets().values()
                    .get(chosenSpreadsheetId, "A:Z")
                    .execute();

            List<List<Object>> values = vr.getValues();
            if (values == null) values = List.of();

            List<List<String>> rows = new ArrayList<>();
            int max = Math.min(values.size(), Math.max(1, limitRows));
            for (int i = 0; i < max; i++) {
                List<Object> row = values.get(i);
                List<String> r = new ArrayList<>();
                if (row != null) {
                    for (Object cell : row) r.add(cell == null ? "" : String.valueOf(cell));
                }
                rows.add(r);
            }

            return new ResponsePreviewDto(
                    formId,
                    formTitle,
                    chosenSpreadsheetId,
                    chosenSpreadsheetName,
                    rows
            );

        } catch (GoogleJsonResponseException e) {
            String msg = (e.getDetails() != null && e.getDetails().getMessage() != null)
                    ? e.getDetails().getMessage()
                    : e.getMessage();
            throw new RuntimeException("Google API 오류: " + msg, e);
        } catch (Exception e) {
            throw new RuntimeException("Failed to preview responses from Sheets", e);
        }
    }
    public FormResponsesDto listResponses(OAuth2AuthenticationToken auth, String formId, int pageSize, String pageToken) {
        try {
            var forms = google.forms(auth);

            var req = forms.forms().responses().list(formId)
                    .setPageSize(pageSize);

            if (pageToken != null && !pageToken.isBlank()) {
                req.setPageToken(pageToken);
            }

            var resp = req.execute();

            var outResponses = new java.util.ArrayList<FormResponsesDto.FormResponseDto>();

            if (resp.getResponses() != null) {
                for (var r : resp.getResponses()) {
                    java.util.Map<String, FormResponsesDto.AnswerDto> mapped = new java.util.HashMap<>();

                    if (r.getAnswers() != null) {
                        for (var entry : r.getAnswers().entrySet()) {
                            String questionId = entry.getKey();
                            var ans = entry.getValue();

                            java.util.List<String> values = new java.util.ArrayList<>();
                            java.util.List<FormResponsesDto.FileDto> files = new java.util.ArrayList<>();

                            // ✅ 선택형/주관식: textAnswers 로 내려옴
                            if (ans.getTextAnswers() != null && ans.getTextAnswers().getAnswers() != null) {
                                for (var ta : ans.getTextAnswers().getAnswers()) {
                                    if (ta.getValue() != null) values.add(ta.getValue());
                                }
                            }

                            // ✅ 파일 업로드 문항: fileUploadAnswers
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