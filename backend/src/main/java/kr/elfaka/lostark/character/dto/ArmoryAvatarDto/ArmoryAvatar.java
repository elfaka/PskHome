package kr.elfaka.lostark.character.dto.ArmoryAvatarDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class ArmoryAvatar {

    @JsonProperty("Type")
    private String type;  // 아바타 종류 (예: 무기 아바타, 상의 아바타 등)

    @JsonProperty("Name")
    private String name;  // 아바타 이름

    @JsonProperty("Icon")
    private String icon;  // 아바타 아이콘 URL

    @JsonProperty("Grade")
    private String grade;  // 아바타 등급 (예: 전설, 영웅 등)

    @JsonProperty("IsSet")
    private boolean isSet;  // 세트 여부

    @JsonProperty("IsInner")
    private boolean isInner;  // 내부 아바타 여부

    @JsonProperty("Tooltip")
    private String tooltip;  // JSON 형태의 문자열 툴팁
}