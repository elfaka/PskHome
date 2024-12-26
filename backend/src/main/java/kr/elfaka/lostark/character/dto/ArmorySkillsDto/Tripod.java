package kr.elfaka.lostark.character.dto.ArmorySkillsDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class Tripod {

    @JsonProperty("Tier")
    private int tier;  // 트라이포드 단계

    @JsonProperty("Slot")
    private int slot;  // 슬롯 번호

    @JsonProperty("Name")
    private String name;  // 트라이포드 이름

    @JsonProperty("Icon")
    private String icon;  // 트라이포드 아이콘 URL

    @JsonProperty("Level")
    private int level;  // 트라이포드 레벨

    @JsonProperty("IsSelected")
    private boolean isSelected;  // 선택 여부

    @JsonProperty("Tooltip")
    private String tooltip;  // 트라이포드에 대한 설명 (HTML 문자열)
}