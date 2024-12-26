package kr.elfaka.lostark.character.dto.ArkPassiveDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;

@Data
public class ArkPassive {

    @JsonProperty("IsArkPassive")
    private boolean isArkPassive;  // 아크 패시브 활성화 여부

    @JsonProperty("Points")
    private List<ArkPassivePoint> points;  // 아크 패시브 포인트 배열

    @JsonProperty("Effects")
    private List<ArkPassiveEffect> effects;  // 아크 패시브 효과 배열
}
