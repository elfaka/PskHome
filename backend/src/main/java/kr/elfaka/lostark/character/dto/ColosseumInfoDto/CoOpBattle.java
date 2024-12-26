package kr.elfaka.lostark.character.dto.ColosseumInfoDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class CoOpBattle {

    @JsonProperty("PlayCount")
    private int playCount;  // 플레이 횟수

    @JsonProperty("VictoryCount")
    private int victoryCount;  // 승리 횟수

    @JsonProperty("LoseCount")
    private int loseCount;  // 패배 횟수

    @JsonProperty("TieCount")
    private int tieCount;  // 무승부 횟수

    @JsonProperty("KillCount")
    private int killCount;  // 킬 횟수

    @JsonProperty("AceCount")
    private int aceCount;  // 에이스 횟수

    @JsonProperty("DeathCount")
    private int deathCount;  // 사망 횟수
}