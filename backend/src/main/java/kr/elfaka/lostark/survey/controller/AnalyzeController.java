package kr.elfaka.lostark.survey.controller;

import kr.elfaka.lostark.survey.dto.AnalyzeResultDto;
import kr.elfaka.lostark.survey.service.AnalyzeService;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/forms")
public class AnalyzeController {

    private final AnalyzeService analyzeService;

    public AnalyzeController(AnalyzeService analyzeService) {
        this.analyzeService = analyzeService;
    }

    @GetMapping("/{formId}/analyze")
    public AnalyzeResultDto analyze(
            OAuth2AuthenticationToken auth,
            @PathVariable("formId") String formId,
            @RequestParam(name = "limit", defaultValue = "200") int limit
    ) {
        return analyzeService.analyze(auth, formId, limit);
    }
}
