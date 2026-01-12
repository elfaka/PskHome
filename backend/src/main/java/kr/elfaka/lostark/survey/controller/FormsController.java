package kr.elfaka.lostark.survey.controller;

import kr.elfaka.lostark.survey.dto.FormListItemDto;
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
}