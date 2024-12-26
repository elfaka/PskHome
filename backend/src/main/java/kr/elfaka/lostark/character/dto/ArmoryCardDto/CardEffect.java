package kr.elfaka.lostark.character.dto.ArmoryCardDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;

@Data
public class CardEffect {

    @JsonProperty("Index")
    private int index;  // 카드 효과 인덱스

    @JsonProperty("CardSlots")
    private List<Integer> cardSlots;  // 카드 슬롯 배열

    @JsonProperty("Items")
    private List<CardItem> items;  // 카드 효과 항목들
}