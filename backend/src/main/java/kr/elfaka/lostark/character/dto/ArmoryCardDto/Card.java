package kr.elfaka.lostark.character.dto.ArmoryCardDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class Card {

    @JsonProperty("Slot")
    private int slot;  // 카드 슬롯 번호

    @JsonProperty("Name")
    private String name;  // 카드 이름

    @JsonProperty("Icon")
    private String icon;  // 카드 아이콘 URL

    @JsonProperty("AwakeCount")
    private int awakeCount;  // 각성 횟수

    @JsonProperty("AwakeTotal")
    private int awakeTotal;  // 각성 총 합

    @JsonProperty("Grade")
    private String grade;  // 카드 등급 (예: 전설)

    @JsonProperty("Tooltip")
    private String tooltip;  // 카드 상세 툴팁 (JSON 문자열)
}