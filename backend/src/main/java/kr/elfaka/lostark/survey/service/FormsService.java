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

/**
 * FormsService
 *
 * [역할]
 * - Google Drive API + Google Forms API를 호출하여
 *   1) 내 설문 목록 조회
 *   2) 설문 구조(문항/보기/타입) 조회
 *   3) 설문 응답(Responses) 조회
 *   를 수행하고, 이를 우리 서비스 DTO로 "정규화"해서 반환한다.
 *
 * [왜 정규화가 필요한가?]
 * - Google Forms API의 Item/Question 구조는 문항 타입마다 형태가 다르며,
 *   특히 그리드(QuestionGroupItem)는 "행/열" 구조라 프론트에서 그대로 쓰기 불편하다.
 * - 따라서 서비스 계층에서 문항 타입을 CHOICE / CHOICE_MULTI / SCALE / TEXT 등으로 통일하고,
 *   그리드 문항은 행(row) 단위로 flatten하여 "일반 객관식 문항처럼" 다룰 수 있게 변환한다.
 *
 * [인증]
 * - OAuth2AuthenticationToken을 통해 로그인된 사용자의 Google API 클라이언트를 생성한다.
 * - 즉, 본인 계정의 설문/응답만 접근 가능한 구조.
 */
@Service
public class FormsService {

    /**
     * GoogleClientFactory
     * - OAuth2AuthenticationToken을 받아
     *   Drive/Forms/Sheets 등 Google API Client를 생성해주는 팩토리
     */
    private final GoogleClientFactory google;

    public FormsService(GoogleClientFactory google) {
        this.google = google;
    }

    /**
     * 내 Google Forms 목록 조회
     *
     * [구현 방식]
     * - Google Forms 자체 목록 API가 아니라,
     *   Drive에서 mimeType='application/vnd.google-apps.form' 파일 목록을 조회한다.
     *
     * [주의]
     * - Drive API list는 기본적으로 필드가 많으므로 setFields로 필요한 데이터만 요청해 성능을 확보한다.
     *
     * @param auth OAuth2 로그인 토큰
     * @return FormListItemDto 리스트 (id, name, modifiedTime)
     */
    public List<FormListItemDto> listMyForms(OAuth2AuthenticationToken auth) {
        try {
            var drive = google.drive(auth);

            // ✅ Drive 검색 쿼리: Google Forms + 휴지통 제외
            String q = "mimeType='application/vnd.google-apps.form' and trashed=false";

            FileList list = drive.files().list()
                    .setQ(q)
                    // ✅ 필요한 필드만: id, name, modifiedTime
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
            // 외부 API 호출 실패는 RuntimeException으로 래핑하여 컨트롤러 레벨에서 처리
            throw new RuntimeException("Failed to list Google Forms from Drive", e);
        }
    }

    /**
     * 설문 구조(문항/보기/타입) 조회
     *
     * [반환 데이터 특징]
     * - FormDetailDto는 프론트에서 문항 카드/분석 UI를 만들기 위한 "설문 메타 데이터"
     * - 각 문항은 QuestionDto로 정규화되어, type과 options를 일관된 형태로 갖는다.
     *
     * [핵심 처리]
     * 1) 일반 문항(QuestionItem) 파싱
     * 2) 그리드 문항(QuestionGroupItem) flatten 처리
     *    - 그리드의 행(row) 하나를 "하나의 질문"으로 취급해 리스트에 추가
     *    - RADIO -> CHOICE / CHECK_BOX -> CHOICE_MULTI
     * 3) 선형 배율(ScaleQuestion)은 1..N 옵션을 만들어 SCALE 타입으로 정규화
     */
    public FormDetailDto getFormDetail(OAuth2AuthenticationToken auth, String formId) {
        try {
            var forms = google.forms(auth);

            // ✅ Forms API로 설문(폼) 전체 구조 조회
            Form form = forms.forms().get(formId).execute();

            String title = (form.getInfo() != null && form.getInfo().getTitle() != null)
                    ? form.getInfo().getTitle()
                    : "(no title)";

            List<FormDetailDto.QuestionDto> questions = new ArrayList<>();

            if (form.getItems() != null) {
                for (Item item : form.getItems()) {

                    // -------------------------------------------------------
                    // 1) 일반 단일 문항(QuestionItem)
                    // -------------------------------------------------------
                    if (item.getQuestionItem() != null && item.getQuestionItem().getQuestion() != null) {
                        Question q = item.getQuestionItem().getQuestion();

                        // questionId는 응답/집계의 key로 사용되므로 매우 중요
                        String qid = q.getQuestionId();

                        // item.title은 사용자에게 보이는 질문 문구
                        String qTitle = item.getTitle() != null ? item.getTitle() : "(no question title)";

                        // 타입/보기 등을 정규화 파싱
                        ParsedQuestion parsed = parseSingleQuestion(q, qTitle);

                        questions.add(new FormDetailDto.QuestionDto(
                                qid,
                                parsed.title,
                                parsed.type,
                                parsed.options
                        ));
                        continue;
                    }

                    // -------------------------------------------------------
                    // 2) 그리드 문항(QuestionGroupItem)
                    // -------------------------------------------------------
                    if (item.getQuestionGroupItem() != null) {
                        var group = item.getQuestionGroupItem();

                        // (a) 그리드의 "열(columns)" 선택지
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

                        // (b) 그리드의 전체 제목(그룹 제목)
                        String groupTitle = item.getTitle() != null ? item.getTitle() : "(grid)";

                        // (c) 그리드의 "각 행(row)"은 실제로 별도 questionId를 가진다.
                        //     -> 분석 관점에서는 행(row)마다 하나의 문항으로 flatten하는 것이 다루기 쉬움
                        if (group.getQuestions() != null) {
                            for (Question rowQ : group.getQuestions()) {
                                String rowQid = rowQ.getQuestionId();

                                String rowTitle = (rowQ.getRowQuestion() != null && rowQ.getRowQuestion().getTitle() != null)
                                        ? rowQ.getRowQuestion().getTitle()
                                        : "(row)";

                                // ✅ flatten된 문항 제목: "그룹 제목 - 행 제목"
                                String flattenedTitle = groupTitle + " - " + rowTitle;

                                // ✅ 요구사항: 그리드 타입에 따라 단일/복수 객관식으로 정규화
                                // - RADIO -> CHOICE
                                // - CHECK_BOX -> CHOICE_MULTI
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

    // -------------------------------------------------------
    // 내부 파싱 모델: (type, options) 정규화 결과
    // -------------------------------------------------------
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

    /**
     * 단일 QuestionItem(일반 문항) 타입 파싱
     *
     * [정규화 규칙]
     * - ChoiceQuestion -> CHOICE
     * - TextQuestion/Date/Time -> TEXT
     * - ScaleQuestion(선형 배율) -> SCALE (1..N 옵션 생성)
     * - 그 외 -> UNKNOWN
     *
     * @param q Google Forms Question 객체
     * @param qTitle 사용자에게 보여줄 질문 제목(item.title 기반)
     * @return ParsedQuestion (정규화된 type + options)
     */
    private ParsedQuestion parseSingleQuestion(Question q, String qTitle) {
        // 1) 객관식(ChoiceQuestion) → CHOICE
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

        // 2) 주관식(TextQuestion) → TEXT
        if (q.getTextQuestion() != null) {
            return new ParsedQuestion(qTitle, "TEXT", List.of());
        }

        // 3) 날짜/시간 → TEXT (분석 UI에서는 문자열로 처리)
        if (q.getDateQuestion() != null) {
            return new ParsedQuestion(qTitle, "TEXT", List.of());
        }
        if (q.getTimeQuestion() != null) {
            return new ParsedQuestion(qTitle, "TEXT", List.of());
        }

        // 4) ✅ 선형 배율(Linear scale) → SCALE
        // - low/high 값으로 1..N 옵션을 생성
        // - lowLabel/highLabel은 양 끝 값에만 붙여 UI 표시를 자연스럽게 만든다.
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

        // 그 외 타입은 현재 분석 UI에서 별도 처리가 없으므로 UNKNOWN 처리
        return new ParsedQuestion(qTitle, "UNKNOWN", List.of());
    }

    /**
     * Forms API로 설문 응답 가져오기 (Forms Responses)
     *
     * [특징]
     * - 선택형/주관식 모두 textAnswers로 문자열 values가 내려오는 경우가 일반적
     * - 파일 업로드 문항은 fileUploadAnswers로 내려옴
     *
     * [페이지네이션]
     * - Forms API는 pageToken 기반 페이지네이션을 제공한다.
     * - 프론트에서 nextPageToken이 null이 될 때까지 반복 호출하면 전체 응답 수집 가능.
     *
     * @param auth OAuth2 로그인 정보
     * @param formId Google Form ID
     * @param pageSize 요청 페이지 크기(1~500)
     * @param pageToken 다음 페이지 토큰(없으면 첫 페이지)
     * @return 응답 DTO + nextPageToken
     */
    public FormResponsesDto listResponses(OAuth2AuthenticationToken auth, String formId, int pageSize, String pageToken) {
        try {
            var forms = google.forms(auth);

            // ✅ 응답 목록 요청 준비
            var req = forms.forms().responses().list(formId)
                    .setPageSize(pageSize);

            if (pageToken != null && !pageToken.isBlank()) {
                req.setPageToken(pageToken);
            }

            var resp = req.execute();

            var outResponses = new ArrayList<FormResponsesDto.FormResponseDto>();

            if (resp.getResponses() != null) {
                for (var r : resp.getResponses()) {

                    // questionId -> AnswerDto(values, files) 형태로 매핑
                    java.util.Map<String, FormResponsesDto.AnswerDto> mapped = new java.util.HashMap<>();

                    if (r.getAnswers() != null) {
                        for (var entry : r.getAnswers().entrySet()) {
                            String questionId = entry.getKey();
                            var ans = entry.getValue();

                            List<String> values = new ArrayList<>();
                            List<FormResponsesDto.FileDto> files = new ArrayList<>();

                            // ✅ 문자열 답변(선택형/주관식 포함)
                            // - 다중 응답이 가능한 경우 answers 리스트로 내려올 수 있음
                            if (ans.getTextAnswers() != null && ans.getTextAnswers().getAnswers() != null) {
                                for (var ta : ans.getTextAnswers().getAnswers()) {
                                    if (ta.getValue() != null) values.add(ta.getValue());
                                }
                            }

                            // ✅ 파일 업로드 답변
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
/*
그리드 문항 flatten 처리
→ “분석 관점”에서 row를 하나의 문항으로 다뤄 UI/집계 단순화

문항 타입 정규화(parseSingleQuestion)
→ 프론트에서 타입 분기(CHOICE/SCALE/TEXT)가 쉬워짐

응답 파싱에서 textAnswers/fileUploadAnswers 분리
→ 파일 업로드 문항도 확장 가능하게 구성
 */