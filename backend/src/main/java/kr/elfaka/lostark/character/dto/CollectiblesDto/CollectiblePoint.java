package kr.elfaka.lostark.character.dto.CollectiblesDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class CollectiblePoint {

    @JsonProperty("PointName")
    private String pointName;  // 포인트 이름 (예: '아르테미스', '루테란 서부')

    @JsonProperty("Point")
    private int point;  // 현재 포인트

    @JsonProperty("MaxPoint")
    private int maxPoint;  // 최대 포인트
}
