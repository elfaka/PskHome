package kr.elfaka.lostark.character.dto.ArmoryCardDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import kr.elfaka.lostark.character.dto.ArkPassiveDto.ArkPassivePoint;
import lombok.Data;

import java.util.List;

@Data
public class ArmoryCard {
    @JsonProperty("Cards")
    private List<Card> Cards;  // 카드 슬롯 번호

    @JsonProperty("Effects")
    private List<CardEffect> Effects;  // 카드 이름
}
