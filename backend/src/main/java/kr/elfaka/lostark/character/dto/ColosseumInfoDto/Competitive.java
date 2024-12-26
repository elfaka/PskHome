package kr.elfaka.lostark.character.dto.ColosseumInfoDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class Competitive {

    @JsonProperty("Rank")
    private int rank;  // 랭크

    @JsonProperty("RankName")
    private String rankName;  // 랭크 이름

    @JsonProperty("RankIcon")
    private String rankIcon;  // 랭크 아이콘 URL

    @JsonProperty("RankLastMmr")
    private int rankLastMmr;  // 마지막 MMR 점수

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
