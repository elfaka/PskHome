package kr.elfaka.lostark.character.dto.ArmoryEngravingDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class Effect {

    @JsonProperty("Icon")
    private String icon;  // 효과 아이콘 URL

    @JsonProperty("Name")
    private String name;  // 효과 이름

    @JsonProperty("Description")
    private String description;  // 효과 설명 (HTML 형식의 문자열 포함)
}