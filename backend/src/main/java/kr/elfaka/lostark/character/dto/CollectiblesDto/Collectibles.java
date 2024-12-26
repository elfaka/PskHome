package kr.elfaka.lostark.character.dto.CollectiblesDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;

@Data
public class Collectibles {

    @JsonProperty("Type")
    private String type;  // 수집 가능한 아이템의 종류 (예: '모코코 씨앗', '위대한 미술품')

    @JsonProperty("Icon")
    private String icon;  // 아이콘 이미지 URL

    @JsonProperty("Point")
    private int point;  // 현재 포인트

    @JsonProperty("MaxPoint")
    private int maxPoint;  // 최대 포인트

    @JsonProperty("CollectiblePoints")
    private List<CollectiblePoint> collectiblePoints;  // 수집 가능한 각 포인트들의 배열
}