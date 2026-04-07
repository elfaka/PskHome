package kr.elfaka.lostark.pspost.controller;

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
class PsPostControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String createTestPost() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "title", "테스트 제목",
                "site", "BOJ",
                "problemNumber", "1001",
                "link", "https://boj.kr/1001",
                "level", "Silver",
                "language", "Java",
                "solution", "A + B",
                "contentMd", "# 두 수의 합"
        ));

        return mockMvc.perform(post("/api/posts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
    }

    @Test
    void getPosts_returns200WithPageStructure() throws Exception {
        mockMvc.perform(get("/api/posts")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.totalElements").exists())
                .andExpect(jsonPath("$.totalPages").exists());
    }

    @Test
    void createPost_returns200WithId() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "title", "새 게시글",
                "site", "Programmers",
                "problemNumber", "42587",
                "link", "https://programmers.co.kr/42587",
                "level", "Level2",
                "language", "Java",
                "solution", "queue",
                "contentMd", "# 프린터"
        ));

        mockMvc.perform(post("/api/posts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.matchesPattern("\\d+")));
    }

    @Test
    void getPostById_afterCreate_returns200() throws Exception {
        String idStr = createTestPost();
        Long id = Long.parseLong(idStr);

        mockMvc.perform(get("/api/posts/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.site").value("BOJ"));
    }

    @Test
    void updatePost_afterCreate_returns200WithSameId() throws Exception {
        String idStr = createTestPost();
        Long id = Long.parseLong(idStr);

        String updateBody = objectMapper.writeValueAsString(Map.of(
                "title", "수정된 제목",
                "site", "BOJ",
                "problemNumber", "1001",
                "link", "https://boj.kr/1001",
                "level", "Gold",
                "language", "Kotlin",
                "solution", "updated",
                "contentMd", "# updated"
        ));

        mockMvc.perform(put("/api/posts/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody))
                .andExpect(status().isOk())
                .andExpect(content().string(idStr));
    }

    @Test
    void deletePost_afterCreate_returns200() throws Exception {
        String idStr = createTestPost();
        Long id = Long.parseLong(idStr);

        mockMvc.perform(delete("/api/posts/" + id))
                .andExpect(status().isOk());
    }
}
