package kr.elfaka.lostark.character.dto.ArmoryGemDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;

@Data
public class Effect {

    @JsonProperty("Description")
    private String description;  // 효과 설명

    @JsonProperty("Skills")
    private List<Skill> skills;  // 스킬 배열
}