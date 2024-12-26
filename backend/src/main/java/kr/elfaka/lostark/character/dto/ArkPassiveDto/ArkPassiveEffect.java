package kr.elfaka.lostark.character.dto.ArkPassiveDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class ArkPassiveEffect {

    @JsonProperty("Name")
    private String name;  // 아크 패시브 효과 이름

    @JsonProperty("Description")
    private String description;  // 아크 패시브 효과 설명

    @JsonProperty("Icon")
    private String icon;  // 아크 패시브 효과 아이콘 URL

    @JsonProperty("ToolTip")
    private String toolTip;  // 아크 패시브 툴팁 (HTML 형식의 문자열 포함)
}
