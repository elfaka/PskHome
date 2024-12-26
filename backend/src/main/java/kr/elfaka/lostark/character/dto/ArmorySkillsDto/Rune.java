package kr.elfaka.lostark.character.dto.ArmorySkillsDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class Rune {

    @JsonProperty("Name")
    private String name;  // 룬 이름

    @JsonProperty("Icon")
    private String icon;  // 룬 아이콘 URL

    @JsonProperty("Grade")
    private String grade;  // 룬 등급

    @JsonProperty("Tooltip")
    private String tooltip;  // 룬 툴팁 (HTML 문자열)
}
