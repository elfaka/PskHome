package kr.elfaka.lostark.character.dto.ColosseumInfoDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class TeamElimination {

    @JsonProperty("FirstWinCount")
    private int firstWinCount;  // 1위 횟수

    @JsonProperty("SecondWinCount")
    private int secondWinCount;  // 2위 횟수

    @JsonProperty("ThirdWinCount")
    private int thirdWinCount;  // 3위 횟수

    @JsonProperty("FirstPlayCount")
    private int firstPlayCount;  // 1위 플레이 횟수

    @JsonProperty("SecondPlayCount")
    private int secondPlayCount;  // 2위 플레이 횟수

    @JsonProperty("ThirdPlayCount")
    private int thirdPlayCount;  // 3위 플레이 횟수

    @JsonProperty("AllKillCount")
    private int allKillCount;  // 전체 킬 횟수

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