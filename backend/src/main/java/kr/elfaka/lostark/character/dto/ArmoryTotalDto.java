package kr.elfaka.lostark.character.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import kr.elfaka.lostark.character.dto.ArkPassiveDto.ArkPassive;
import kr.elfaka.lostark.character.dto.ArmoryAvatarDto.ArmoryAvatar;
import kr.elfaka.lostark.character.dto.ArmoryCardDto.ArmoryCard;
import kr.elfaka.lostark.character.dto.ArmoryEngravingDto.ArmoryEngraving;
import kr.elfaka.lostark.character.dto.ArmoryEquipmentDto.ArmoryEquipment;
import kr.elfaka.lostark.character.dto.ArmoryGemDto.ArmoryGem;
import kr.elfaka.lostark.character.dto.ArmoryProfileDto.ArmoryProfile;
import kr.elfaka.lostark.character.dto.ArmorySkillsDto.ArmorySkills;
import kr.elfaka.lostark.character.dto.CollectiblesDto.Collectibles;
import kr.elfaka.lostark.character.dto.ColosseumInfoDto.ColosseumInfo;
import lombok.Data;

import java.util.List;

@Data
public class ArmoryTotalDto {
    @JsonProperty("ArkPassive")
    private ArkPassive arkPassive; // 아크 패시브

    @JsonProperty("ArmoryAvatars")
    private List<ArmoryAvatar> armoryAvatars; // 아바타

    @JsonProperty("ArmoryCard")
    private ArmoryCard armoryCard; // 카드

    @JsonProperty("ArmoryEngraving")
    private ArmoryEngraving armoryEngraving; // 각인

    @JsonProperty("ArmoryEquipment")
    private List<ArmoryEquipment> armoryEquipment; // 장비

    @JsonProperty("ArmoryGem")
    private ArmoryGem armoryGem; // 보석

    @JsonProperty("ArmoryProfile")
    private ArmoryProfile armoryProfile; // 캐릭터 정보

    @JsonProperty("ArmorySkills")
    private List<ArmorySkills> armorySkills; // 스킬

    @JsonProperty("Collectibles")
    private List<Collectibles> collectibles; // 수집형 포인트

    @JsonProperty("ColosseumInfo")
    private ColosseumInfo colosseumInfo; // PVP
}