package kr.elfaka.lostark.jsonprettier.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class JsonFormatControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void format_emptyInput_returns400WithEmptyInputCode() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("input", ""));

        mockMvc.perform(post("/api/json/format")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.error.code").value("EMPTY_INPUT"));
    }

    @Test
    void format_invalidMode_returns400WithInvalidModeCode() throws Exception {
        String body = objectMapper.writeValueAsString(
                Map.of("input", "{\"a\":1}", "mode", "invalid"));

        mockMvc.perform(post("/api/json/format")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_MODE"));
    }

    @Test
    void format_invalidIndent_returns400WithInvalidIndentCode() throws Exception {
        String body = objectMapper.writeValueAsString(
                Map.of("input", "{\"a\":1}", "mode", "prettify", "indent", 3));

        mockMvc.perform(post("/api/json/format")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_INDENT"));
    }

    @Test
    void format_validPrettifyRequest_returns200WithFormattedOutput() throws Exception {
        String body = objectMapper.writeValueAsString(
                Map.of("input", "{\"a\":1}", "mode", "prettify"));

        mockMvc.perform(post("/api/json/format")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.formatted").exists())
                .andExpect(jsonPath("$.stats").exists());
    }

    @Test
    void format_validMinifyRequest_returns200() throws Exception {
        String body = objectMapper.writeValueAsString(
                Map.of("input", "{\n  \"a\": 1\n}", "mode", "minify"));

        mockMvc.perform(post("/api/json/format")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
    }

    @Test
    void health_returns200WithOkTrue() throws Exception {
        mockMvc.perform(get("/api/json/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
    }
}
