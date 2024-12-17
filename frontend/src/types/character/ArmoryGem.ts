// Gem 타입 정의
export interface Gem {
  Slot: number; // 보석 슬롯 번호
  Name: string; // 보석 이름
  Icon: string; // 보석 아이콘 URL
  Level: number; // 보석 레벨
  Grade: string; // 보석 등급 (예: 전설)
  Tooltip: string; // 보석 툴팁 (설명)
}

// Skill 타입 정의
export interface Skill {
  GemSlot: number; // 보석 슬롯 번호
  Name: string; // 스킬 이름
  Description: string[]; // 스킬 설명 (배열 형태로 여러 설명 가능)
  Option: string; // 스킬 옵션
  Icon: string; // 스킬 아이콘 URL
  Tooltip: string; // 스킬 툴팁 (설명)
}

// Effects 타입 정의
export interface Effect {
  Description: string; // 효과 설명
  Skills: Skill[]; // 스킬 배열
}

// Main 타입 정의 (전체 구조)
export interface ArmoryGem {
  Gems: Gem[]; // 보석 배열
  Effects: Effect; // 효과 정보
}
