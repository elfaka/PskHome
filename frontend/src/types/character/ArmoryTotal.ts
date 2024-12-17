import { ArkPassive } from "./ArkPassive";
import { ArmoryAvatars } from "./ArmoryAvatars";
import { ArmoryCard } from "./ArmoryCard";
import { ArmoryEngraving } from "./ArmoryEngraving";
import { ArmoryEquipment } from "./ArmoryEquipment";
import { ArmoryGem } from "./ArmoryGem";
import { ArmoryProfile } from "./ArmoryProfile";
import { ArmorySkills } from "./ArmorySkills";
import { Collectibles } from "./Collectibles";
import { ColosseumInfo } from "./ColosseumInfo";

export interface ArmoryTotal {
  ArkPassive: ArkPassive; // 아크 패시브
  ArmoryAvatars: ArmoryAvatars; // 아바타
  ArmoryCard: ArmoryCard; // 카드
  ArmoryEngraving: ArmoryEngraving; // 각인
  ArmoryEquipment: ArmoryEquipment; // 장비
  ArmoryGem: ArmoryGem; // 보석
  ArmoryProfile: ArmoryProfile; // 캐릭터 정보
  ArmorySkills: ArmorySkills; // 스킬
  Collectibles: Collectibles; // 수집형 포인트
  ColosseumInfo: ColosseumInfo; //PVP
}
