// Tripod 타입 정의
export interface Tripod {
  Tier: number; // 트라이포드 단계
  Slot: number; // 슬롯 번호
  Name: string; // 트라이포드 이름
  Icon: string; // 트라이포드 아이콘 URL
  Level: number; // 트라이포드 레벨
  IsSelected: boolean; // 선택 여부
  Tooltip: string; // 트라이포드에 대한 설명 (HTML 문자열)
}

export interface Rune {
  Name: string;
  Icon: string;
  Grade: string;
  Tooltip: string;
}

// ArmorySkill 타입 정의
export interface ArmorySkill {
  Name: string; // 스킬 이름
  Icon: string; // 스킬 아이콘 URL
  Level: number; // 스킬 레벨
  Type: string; // 스킬 타입 (예: 일반, 각성 등)
  SkillType: number; // 스킬 타입 코드 (숫자값)
  Tripods: Tripod[]; // 트라이포드 정보 배열
  Rune: Rune;
  Tooltip: string; // 스킬 상세 툴팁 (HTML 문자열)
}
