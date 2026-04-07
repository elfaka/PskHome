package kr.elfaka.lostark.pspost.service;

import kr.elfaka.lostark.pspost.dto.PsPostRequestDto;
import kr.elfaka.lostark.pspost.dto.PsPostResponseDto;
import kr.elfaka.lostark.pspost.entity.PsPost;
import kr.elfaka.lostark.pspost.repository.PsPostRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PsPostServiceTest {

    @Mock
    private PsPostRepository psPostRepository;

    @InjectMocks
    private PsPostService psPostService;

    private PsPost buildPost() {
        return PsPost.builder()
                .title("Test Title")
                .site("BOJ")
                .problemNumber("1001")
                .link("https://boj.kr/1001")
                .level("Silver")
                .language("Java")
                .solution("solution text")
                .contentMd("# content")
                .isSolved(true)
                .build();
    }

    @Test
    void createPost_delegatesToRepositorySave_andReturnsId() {
        PsPost savedPost = mock(PsPost.class);
        when(savedPost.getId()).thenReturn(42L);
        when(psPostRepository.save(any(PsPost.class))).thenReturn(savedPost);

        Long id = psPostService.createPost(new PsPostRequestDto());

        assertThat(id).isEqualTo(42L);
        verify(psPostRepository, times(1)).save(any(PsPost.class));
    }

    @Test
    void getPostById_whenExists_returnsDto() {
        PsPost post = buildPost();
        when(psPostRepository.findById(1L)).thenReturn(Optional.of(post));

        PsPostResponseDto result = psPostService.getPostById(1L);

        assertThat(result.getTitle()).isEqualTo("Test Title");
        assertThat(result.getSite()).isEqualTo("BOJ");
        assertThat(result.getIsSolved()).isTrue();
    }

    @Test
    void getPostById_whenNotExists_throwsIllegalArgumentException() {
        when(psPostRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> psPostService.getPostById(999L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("999");
    }

    @Test
    void getPosts_returnsMappedPage() {
        PsPost post = buildPost();
        Page<PsPost> mockPage = new PageImpl<>(List.of(post), PageRequest.of(0, 10), 1);
        when(psPostRepository.findAllByOrderByCreatedAtDesc(any(Pageable.class))).thenReturn(mockPage);

        Page<PsPostResponseDto> result = psPostService.getPosts(0, 10);

        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent()).hasSize(1);
        assertThat(result.getContent().get(0).getTitle()).isEqualTo("Test Title");
    }

    @Test
    void updatePost_whenNotExists_throwsIllegalArgumentException() {
        when(psPostRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> psPostService.updatePost(999L, new PsPostRequestDto()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void updatePost_whenExists_savesAndReturnsId() {
        PsPost post = buildPost();
        PsPost savedPost = mock(PsPost.class);
        when(savedPost.getId()).thenReturn(1L);
        when(psPostRepository.findById(1L)).thenReturn(Optional.of(post));
        when(psPostRepository.save(any(PsPost.class))).thenReturn(savedPost);

        Long id = psPostService.updatePost(1L, new PsPostRequestDto());

        assertThat(id).isEqualTo(1L);
        verify(psPostRepository, times(1)).save(post);
    }

    @Test
    void deletePost_callsRepositoryDeleteById() {
        psPostService.deletePost(5L);
        verify(psPostRepository, times(1)).deleteById(5L);
    }
}
