package kr.elfaka.lostark.pspost.service;

import kr.elfaka.lostark.pspost.dto.PsPostRequestDto;
import kr.elfaka.lostark.pspost.dto.PsPostResponseDto;
import kr.elfaka.lostark.pspost.entity.PsPost;
import kr.elfaka.lostark.pspost.repository.PsPostRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.sql.Timestamp;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

@Service
@RequiredArgsConstructor
public class PsPostService {

    private final PsPostRepository psPostRepository;

    // 게시글 생성
    public Long createPost(PsPostRequestDto dto) {
        PsPost post = PsPost.builder()
                .title(dto.getTitle())
                .site(dto.getSite())
                .problemNumber(dto.getProblemNumber())
                .link(dto.getLink())
                .level(dto.getLevel())
                .language(dto.getLanguage())
                .solution(dto.getSolution())
                .contentMd(dto.getContentMd())
                .isSolved(true)
                .build();
        return psPostRepository.save(post).getId();
    }
    // 게시글 전체 조회
    public Page<PsPostResponseDto> getPosts(int page, int size) {
        return psPostRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(page, size))
                .map(PsPostResponseDto::fromEntity);
    }

    // 게시글 단건 조회
    public PsPostResponseDto getPostById(Long id) {
        PsPost post = psPostRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("해당 게시글이 없습니다. id=" + id));
        return PsPostResponseDto.fromEntity(post);
    }

    // 게시글 수정
    public Long updatePost(Long id, PsPostRequestDto dto) {
        PsPost post = psPostRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("해당 게시글이 없습니다. id=" + id));
        post.update(dto);
        return psPostRepository.save(post).getId();
    }

    // 게시글 삭제
    public void deletePost(Long id) {
        psPostRepository.deleteById(id);
    }
}