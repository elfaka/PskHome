package kr.elfaka.lostark.character.dto.ArmoryEquipmentDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class ArmoryEquipment {

    @JsonProperty("Type")
    private String type;  // 장비 타입 (예: 무기, 투구, 상의 등)

    @JsonProperty("Name")
    private String name;  // 장비 이름

    @JsonProperty("Icon")
    private String icon;  // 장비 아이콘 URL

    @JsonProperty("Grade")
    private String grade;  // 장비 등급 (예: 고대)

    @JsonProperty("Tooltip")
    private String tooltip;  // Tooltip은 JSON 문자열 형태
}
