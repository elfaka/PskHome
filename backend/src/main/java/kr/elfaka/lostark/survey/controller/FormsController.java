package kr.elfaka.lostark.survey.controller;

import kr.elfaka.lostark.survey.dto.FormDetailDto;
import kr.elfaka.lostark.survey.dto.FormListItemDto;
import kr.elfaka.lostark.survey.dto.FormResponsesDto;
import kr.elfaka.lostark.survey.dto.ResponsePreviewDto;
import kr.elfaka.lostark.survey.dto.SpreadsheetCandidateDto;
import kr.elfaka.lostark.survey.service.FormsService;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/forms")
public class FormsController {

    private final FormsService formsService;

    public FormsController(FormsService formsService) {
        this.formsService = formsService;
    }

    @GetMapping
    public List<FormListItemDto> list(OAuth2AuthenticationToken auth) {
        return formsService.listMyForms(auth);
    }

    @GetMapping("/{formId}")
    public FormDetailDto detail(OAuth2AuthenticationToken auth,
                                @PathVariable("formId") String formId) {
        return formsService.getFormDetail(auth, formId);
    }

    // ✅ Step 2-4: 응답 스프레드시트 후보 리스트
    @GetMapping("/{formId}/responses/spreadsheets")
    public List<SpreadsheetCandidateDto> responseSpreadsheets(
            OAuth2AuthenticationToken auth,
            @PathVariable("formId") String formId
    ) {
        return formsService.listResponseSpreadsheets(auth, formId);
    }

    // ✅ Step 2-4: spreadsheetId를 받아 프리뷰(없으면 자동선택)
    @GetMapping("/{formId}/responses/preview")
    public ResponsePreviewDto preview(
            OAuth2AuthenticationToken auth,
            @PathVariable("formId") String formId,
            @RequestParam(name = "spreadsheetId", required = false) String spreadsheetId,
            @RequestParam(name = "limit", defaultValue = "5") int limit
    ) {
        return formsService.previewResponses(auth, formId, spreadsheetId, limit);
    }
    @GetMapping("/{formId}/responses")
    public FormResponsesDto responses(
            OAuth2AuthenticationToken auth,
            @PathVariable("formId") String formId,
            @RequestParam(name = "limit", defaultValue = "50") int limit,
            @RequestParam(name = "pageToken", required = false) String pageToken
    ) {
        int pageSize = Math.min(Math.max(limit, 1), 500); // 안전 제한
        return formsService.listResponses(auth, formId, pageSize, pageToken);
    }
}
