export interface Engraving {
  Slot: number;
  Name: string;
  Icon: string;
  Tooltip: string; // 설명 (HTML 형식의 문자열 포함)
}

export interface Effect {
  Icon: string;
  Name: string;
  Description: string; // 설명 (HTML 형식의 문자열 포함)
}

// ArkPassiveEffect 타입
export interface ArkPassiveEffect {
  AbilityStoneLevel: number | null; // 각인 스톤 레벨
  Grade: string; // 각인 등급 (예: 유물, 고대)
  Level: number; // 각인 레벨
  Name: string; // 각인 이름 (예: 원한, 돌격대장)
  Description: string; // 각인 효과 설명 (HTML 형식의 문자열 포함)
}

// ArmoryEngraving 타입
export interface ArmoryEngraving {
  Engravings: Engraving | null; // Engravings 필드 (현재 null)
  Effects: Effect | null; // Effects 필드 (현재 null)
  ArkPassiveEffects: ArkPassiveEffect[] | null; // 아크 패시브 효과 배열
}
