// ArkPassivePoint 타입
export interface ArkPassivePoint {
  Name: string; // 아크 패시브 포인트 이름 (예: 진화, 깨달음)
  Value: number; // 아크 패시브 포인트 값
  Tooltip: string; // 툴팁 (HTML 형식의 문자열 포함)
}

// ArkPassiveEffect 타입
export interface ArkPassiveEffect {
  Name: string; // 아크 패시브 효과 이름 (예: 치명, 신속)
  Description: string; // 아크 패시브 효과 설명 (HTML 형식)
  Icon: string; // 아크 패시브 효과 아이콘 URL
  ToolTip: string; // 아크 패시브 툴팁 (HTML 형식의 문자열 포함)
}

// ArkPassive 타입
export interface ArkPassive {
  IsArkPassive: boolean; // 아크 패시브 활성화 여부
  Points: ArkPassivePoint[]; // 아크 패시브 포인트 배열
  Effects: ArkPassiveEffect[]; // 아크 패시브 효과 배열
}
