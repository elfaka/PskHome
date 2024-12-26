package kr.elfaka.lostark.character.dto.ArmoryGemDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class Gem {

    @JsonProperty("Slot")
    private int slot;  // 보석 슬롯 번호

    @JsonProperty("Name")
    private String name;  // 보석 이름

    @JsonProperty("Icon")
    private String icon;  // 보석 아이콘 URL

    @JsonProperty("Level")
    private int level;  // 보석 레벨

    @JsonProperty("Grade")
    private String grade;  // 보석 등급 (예: 전설)

    @JsonProperty("Tooltip")
    private String tooltip;  // 보석 툴팁 (설명)
}
