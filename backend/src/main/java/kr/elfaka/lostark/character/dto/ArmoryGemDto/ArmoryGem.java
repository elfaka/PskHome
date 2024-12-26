package kr.elfaka.lostark.character.dto.ArmoryGemDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;

@Data
public class ArmoryGem {

    @JsonProperty("Gems")
    private List<Gem> gems;  // 보석 배열

    @JsonProperty("Effects")
    private Effect effects;  // 효과 정보
}
