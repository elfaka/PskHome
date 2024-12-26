package kr.elfaka.lostark.character.dto.ArmoryEngravingDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;

@Data
public class ArmoryEngraving {

    @JsonProperty("Engravings")
    private Engraving engravings;  // Engravings 필드 (현재 null)

    @JsonProperty("Effects")
    private Effect effects;  // Effects 필드 (현재 null)

    @JsonProperty("ArkPassiveEffects")
    private List<ArkPassiveEffect> arkPassiveEffects;  // 아크 패시브 효과 배열
}
