package kr.elfaka.lostark.character.dto.ArmoryEngravingDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class ArkPassiveEffect {

    @JsonProperty("AbilityStoneLevel")
    private Integer abilityStoneLevel;  // 각인 스톤 레벨 (nullable)

    @JsonProperty("Grade")
    private String grade;  // 각인 등급 (예: 유물, 고대)

    @JsonProperty("Level")
    private int level;  // 각인 레벨

    @JsonProperty("Name")
    private String name;  // 각인 이름 (예: 원한, 돌격대장)

    @JsonProperty("Description")
    private String description;  // 각인 효과 설명 (HTML 형식의 문자열 포함)
}
