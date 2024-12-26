package kr.elfaka.lostark.character.dto.ArmoryProfileDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class Tendency {

    @JsonProperty("Type")
    private String type;  // 성향 종류 (예: 지성, 담력 등)

    @JsonProperty("Point")
    private int point;  // 현재 포인트 값

    @JsonProperty("MaxPoint")
    private int maxPoint;  // 최대 포인트 값
}