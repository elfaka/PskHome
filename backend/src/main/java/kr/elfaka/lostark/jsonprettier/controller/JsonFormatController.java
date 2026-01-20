package kr.elfaka.lostark.jsonprettier.controller;

import kr.elfaka.lostark.jsonprettier.dto.JsonFormatRequestDto;
import kr.elfaka.lostark.jsonprettier.dto.JsonFormatResponseDto;
import kr.elfaka.lostark.jsonprettier.service.JsonFormatService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/json")
public class JsonFormatController {

    private final JsonFormatService service;

    public JsonFormatController(JsonFormatService service) {
        this.service = service;
    }

    @PostMapping("/format")
    public ResponseEntity<JsonFormatResponseDto> format(@RequestBody JsonFormatRequestDto req) throws Exception {
        String input = (req.getInput() == null) ? "" : req.getInput();

        // 1) 빈 입력 처리: "그냥 빈 문자열 반환" vs "400"
        // 포트폴리오 퀄리티 관점에선 400이 더 명확함
        if (input.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(JsonFormatResponseDto.fail("EMPTY_INPUT", "input is empty", null, null));
        }

        String mode = (req.getMode() == null || req.getMode().isBlank())
                ? "prettify"
                : req.getMode().trim().toLowerCase();

        // 2) mode 제한
        if (!mode.equals("prettify") && !mode.equals("minify")) {
            return ResponseEntity.badRequest()
                    .body(JsonFormatResponseDto.fail("INVALID_MODE", "mode must be prettify or minify", null, null));
        }

        // 3) indent 제한 (minify면 무시해도 되지만, 일단 값이 오면 제한하는 게 깔끔)
        int indent = (req.getIndent() == null) ? 2 : req.getIndent();
        if (indent != 2 && indent != 4) {
            return ResponseEntity.badRequest()
                    .body(JsonFormatResponseDto.fail("INVALID_INDENT", "indent must be 2 or 4", null, null));
        }

        boolean sortKeys = Boolean.TRUE.equals(req.getSortKeys());
        boolean ensureAscii = Boolean.TRUE.equals(req.getEnsureAscii());

        String formatted = service.format(input, mode, indent, sortKeys, ensureAscii);
        int inLen = input.length();
        int outLen = (formatted == null) ? 0 : formatted.length();

        return ResponseEntity.ok(JsonFormatResponseDto.success(mode, formatted, inLen, outLen));
    }


    // 선택: 간단 헬스체크
    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("ok", true);
    }
}
