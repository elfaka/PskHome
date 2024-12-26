package kr.elfaka.lostark.character.dto.ArmoryCardDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class CardItem {

    @JsonProperty("Name")
    private String name;  // 카드 이름

    @JsonProperty("Description")
    private String description;  // 카드 효과 설명
}