package kr.elfaka.lostark.character.dto.ColosseumInfoDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class Colosseum {

    @JsonProperty("SeasonName")
    private String seasonName;  // 시즌 이름

    @JsonProperty("Competitive")
    private Competitive competitive;  // 경쟁 모드 정보

    @JsonProperty("TeamDeathmatch")
    private TeamDeathmatch teamDeathmatch;  // 팀 데스매치 모드 정보

    @JsonProperty("TeamElimination")
    private TeamElimination teamElimination;  // 팀 엘리미네이션 모드 정보

    @JsonProperty("CoOpBattle")
    private CoOpBattle coOpBattle;  // 협동 배틀 모드 정보

    @JsonProperty("OneDeathmatch")
    private OneDeathmatch oneDeathmatch;  // 1인 데스매치 모드 정보
}