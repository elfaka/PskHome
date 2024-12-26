package kr.elfaka.lostark.character.dto.ArmorySkillsDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;

@Data
public class ArmorySkills {

    @JsonProperty("Name")
    private String name;  // 스킬 이름

    @JsonProperty("Icon")
    private String icon;  // 스킬 아이콘 URL

    @JsonProperty("Level")
    private int level;  // 스킬 레벨

    @JsonProperty("Type")
    private String type;  // 스킬 타입 (예: 일반, 각성 등)

    @JsonProperty("SkillType")
    private int skillType;  // 스킬 타입 코드 (숫자값)

    @JsonProperty("Tripods")
    private List<Tripod> tripods;  // 트라이포드 정보 배열

    @JsonProperty("Rune")
    private Rune rune;  // 룬 정보

    @JsonProperty("Tooltip")
    private String tooltip;  // 스킬 상세 툴팁 (HTML 문자열)
}
