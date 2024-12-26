package kr.elfaka.lostark.character.dto.ArmoryEngravingDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class Engraving {

    @JsonProperty("Slot")
    private int slot;  // 각인 슬롯 번호

    @JsonProperty("Name")
    private String name;  // 각인 이름

    @JsonProperty("Icon")
    private String icon;  // 각인 아이콘 URL

    @JsonProperty("Tooltip")
    private String tooltip;  // 설명 (HTML 형식의 문자열 포함)
}