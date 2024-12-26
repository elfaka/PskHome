package kr.elfaka.lostark.character.dto.ArkPassiveDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class ArkPassivePoint {

    @JsonProperty("Name")
    private String name;  // 아크 패시브 포인트 이름

    @JsonProperty("Value")
    private int value;  // 아크 패시브 포인트 값

    @JsonProperty("Tooltip")
    private String tooltip;  // 툴팁 (HTML 형식의 문자열 포함)
}


