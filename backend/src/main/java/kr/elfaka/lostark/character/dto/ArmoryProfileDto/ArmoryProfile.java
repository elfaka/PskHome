package kr.elfaka.lostark.character.dto.ArmoryProfileDto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.util.List;

@Data
public class ArmoryProfile {

    @JsonProperty("CharacterImage")
    private String characterImage;  // 캐릭터 이미지 URL

    @JsonProperty("ExpeditionLevel")
    private int expeditionLevel;  // 원정대 레벨

    @JsonProperty("PvpGradeName")
    private String pvpGradeName;  // PVP 등급

    @JsonProperty("TownLevel")
    private int townLevel;  // 마을 레벨

    @JsonProperty("TownName")
    private String townName;  // 마을 이름

    @JsonProperty("Title")
    private String title;  // 칭호

    @JsonProperty("GuildMemberGrade")
    private String guildMemberGrade;  // 길드 내 등급 (예: 일반 길드원)

    @JsonProperty("GuildName")
    private String guildName;  // 길드 이름

    @JsonProperty("UsingSkillPoint")
    private int usingSkillPoint;  // 사용 중인 스킬 포인트

    @JsonProperty("TotalSkillPoint")
    private int totalSkillPoint;  // 총 스킬 포인트

    @JsonProperty("Stats")
    private List<Stat> stats;  // 캐릭터 스탯 배열

    @JsonProperty("Tendencies")
    private List<Tendency> tendencies;  // 성향 배열

    @JsonProperty("ServerName")
    private String serverName;  // 서버 이름

    @JsonProperty("CharacterName")
    private String characterName;  // 캐릭터 이름

    @JsonProperty("CharacterLevel")
    private int characterLevel;  // 캐릭터 레벨

    @JsonProperty("CharacterClassName")
    private String characterClassName;  // 캐릭터 클래스 이름

    @JsonProperty("ItemAvgLevel")
    private String itemAvgLevel;  // 아이템 평균 레벨

    @JsonProperty("ItemMaxLevel")
    private String itemMaxLevel;  // 아이템 최대 레벨
}
