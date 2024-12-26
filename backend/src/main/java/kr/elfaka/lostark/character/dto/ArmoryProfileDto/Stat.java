package kr.elfaka.lostark.character.dto.ArmoryProfileDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;

@Data
public class Stat {

    @JsonProperty("Type")
    private String type;  // 스탯 종류 (예: 치명, 특화 등)

    @JsonProperty("Value")
    private String value;  // 스탯 값

    @JsonProperty("Tooltip")
    private List<String> tooltip;  // 상세 설명 (HTML 형식의 문자열 배열)
}
