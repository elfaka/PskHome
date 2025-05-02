package kr.elfaka.lostark.pspost.dto;

import kr.elfaka.lostark.pspost.entity.PsPost;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.sql.Timestamp;

@Getter
@NoArgsConstructor
public class PsPostResponseDto {
    private Long id;
    private String title;
    private String site;
    private String problemNumber;
    private String link;
    private String level;
    private String language;
    private String solution;
    private String contentMd;
    private Boolean isSolved;
    private Timestamp createdAt;

    public static PsPostResponseDto fromEntity(PsPost post) {
        PsPostResponseDto dto = new PsPostResponseDto();
        dto.id = post.getId();
        dto.title = post.getTitle();
        dto.site = post.getSite();
        dto.problemNumber = post.getProblemNumber();
        dto.link = post.getLink();
        dto.level = post.getLevel();
        dto.language = post.getLanguage();
        dto.solution = post.getSolution();
        dto.contentMd = post.getContentMd();
        dto.isSolved = post.getIsSolved();
        dto.createdAt = post.getCreatedAt();
        return dto;
    }
}