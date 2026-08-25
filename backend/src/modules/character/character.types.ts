/**
 * LostArk Armory 응답 타입 (간소화).
 *
 * 기존 Java 에는 Armory* DTO 클래스가 30여 개 있었지만, 이 모듈은 외부 API 를
 * **가공 없이 그대로 전달하는 프록시**다. 필드를 하나하나 선언하면
 * 외부 API 가 바뀔 때마다 응답이 소리 없이 잘려나가는 위험만 커진다.
 *
 * 그래서 최상위 키만 문서화 목적으로 남기고 값은 통과시킨다.
 * (기존 DTO 는 @JsonProperty 로 PascalCase 키를 유지했으므로, 그대로 넘겨도 키 이름이 같다)
 */
export interface ArmoryTotal {
  /** 아크 패시브 */
  ArkPassive?: unknown;
  /** 아바타 */
  ArmoryAvatars?: unknown;
  /** 카드 */
  ArmoryCard?: unknown;
  /** 각인 */
  ArmoryEngraving?: unknown;
  /** 장비 */
  ArmoryEquipment?: unknown;
  /** 보석 */
  ArmoryGem?: unknown;
  /** 캐릭터 정보 */
  ArmoryProfile?: unknown;
  /** 스킬 */
  ArmorySkills?: unknown;
  /** 수집형 포인트 */
  Collectibles?: unknown;
  /** PVP */
  ColosseumInfo?: unknown;

  [key: string]: unknown;
}
