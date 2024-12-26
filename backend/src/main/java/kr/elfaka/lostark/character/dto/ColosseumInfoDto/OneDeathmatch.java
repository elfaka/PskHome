package kr.elfaka.lostark.character.dto.ColosseumInfoDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class OneDeathmatch {

    @JsonProperty("KillCount")
    private int killCount;  // 킬 횟수

    @JsonProperty("DeathCount")
    private int deathCount;  // 사망 횟수

    @JsonProperty("AllKillCount")
    private int allKillCount;  // 전체 킬 횟수

    @JsonProperty("OutDamage")
    private int outDamage;  // 피해량

    @JsonProperty("InDamage")
    private int inDamage;  // 받는 피해량

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
}
