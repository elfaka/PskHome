package kr.elfaka.lostark.pspost.controller;

import kr.elfaka.lostark.pspost.dto.PsPostRequestDto;
import kr.elfaka.lostark.pspost.dto.PsPostResponseDto;
import kr.elfaka.lostark.pspost.service.PsPostService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/posts")
@RequiredArgsConstructor
public class PsPostController {

    private final PsPostService psPostService;

    // 게시글 등록
    @PostMapping
    public Long createPost(@RequestBody PsPostRequestDto requestDto) {
        return psPostService.createPost(requestDto);
    }

    // 게시글 목록 조회
    @GetMapping
    public List<PsPostResponseDto> getAllPosts() {
        return psPostService.getAllPosts();
    }

    // 게시글 상세 조회
    @GetMapping("/{id}")
    public PsPostResponseDto getPostById(@PathVariable("id") Long id) {
        return psPostService.getPostById(id);
    }

    // 게시글 수정
    @PutMapping("/{id}")
    public Long updatePost(@PathVariable("id") Long id, @RequestBody PsPostRequestDto requestDto) {
        return psPostService.updatePost(id, requestDto);
    }

    // 게시글 삭제
    @DeleteMapping("/{id}")
    public void deletePost(@PathVariable("id") Long id) {
        psPostService.deletePost(id);
    }
}