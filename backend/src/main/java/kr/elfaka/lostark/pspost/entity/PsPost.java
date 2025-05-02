package kr.elfaka.lostark.pspost.entity;

import jakarta.persistence.*;
import kr.elfaka.lostark.pspost.dto.PsPostRequestDto;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

// jakarta.persistence.*;
import java.sql.Timestamp;

@Entity
@Getter
@NoArgsConstructor
@Table(name = "ps_post")
public class PsPost {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String title;
    private String site;

    @Column(name = "problem_number")
    private String problemNumber;

    private String link;
    private String level;
    private String language;
    private String solution;

    @Column(name = "content_md")
    private String contentMd;  // 마크다운 형식 본문 추가

    @Column(name = "is_solved")
    private Boolean isSolved;

    @Column(name = "created_at", updatable = false)
    private Timestamp createdAt;

    @Builder
    public PsPost(String title, String site, String problemNumber, String link, String level, String language, String contentMd,String solution, Boolean isSolved, Timestamp createdAt) {
        this.title = title;
        this.site = site;
        this.problemNumber = problemNumber;
        this.link = link;
        this.language = language;
        this.level = level;
        this.contentMd = contentMd;
        this.solution = solution;
        this.isSolved = isSolved;
        this.createdAt = createdAt;
    }

    public void update(PsPostRequestDto dto) {
        this.title = dto.getTitle();
        this.site = dto.getSite();
        this.problemNumber = dto.getProblemNumber();
        this.link = dto.getLink();
        this.level = dto.getLevel();
        this.language = dto.getLanguage();
        this.solution = dto.getSolution();
        this.contentMd = dto.getContentMd();
    }
}
