package kr.elfaka.lostark.character.dto.ArmoryGemDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;

@Data
public class Skill {

    @JsonProperty("GemSlot")
    private int gemSlot;  // 보석 슬롯 번호

    @JsonProperty("Name")
    private String name;  // 스킬 이름

    @JsonProperty("Description")
    private List<String> description;  // 스킬 설명 (배열 형태로 여러 설명 가능)

    @JsonProperty("Option")
    private String option;  // 스킬 옵션

    @JsonProperty("Icon")
    private String icon;  // 스킬 아이콘 URL

    @JsonProperty("Tooltip")
    private String tooltip;  // 스킬 툴팁 (설명)
}