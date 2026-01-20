package kr.elfaka.lostark.jsonprettier.error;

import kr.elfaka.lostark.jsonprettier.dto.JsonFormatResponseDto;
import com.fasterxml.jackson.core.JsonLocation;
import com.fasterxml.jackson.core.JsonProcessingException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class JsonPrettierExceptionHandler {

    @ExceptionHandler(JsonProcessingException.class)
    public ResponseEntity<JsonFormatResponseDto> handleJsonProcessing(JsonProcessingException e) {
        JsonLocation loc = e.getLocation();
        Integer line = null;
        Integer column = null;

        if (loc != null) {
            line = (int) loc.getLineNr();
            column = (int) loc.getColumnNr();
        }

        String msg = (e.getOriginalMessage() != null) ? e.getOriginalMessage() : e.getMessage();
        return ResponseEntity.badRequest()
                .body(JsonFormatResponseDto.fail("INVALID_JSON", msg, line, column));
    }
}
