package kr.elfaka.lostark.pspost.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class PsPostRequestDto {
    private String title;
    private String site;
    private String problemNumber;
    private String link;
    private String level;
    private String language;
    private String solution;
    private String contentMd;
    private Boolean isSolved;
}

