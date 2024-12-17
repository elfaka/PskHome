// ArmoryAvatar 인터페이스
export interface ArmoryAvatar {
  Type: string; // 아바타 종류 (예: 무기 아바타, 상의 아바타 등)
  Name: string; // 아바타 이름
  Icon: string; // 아바타 아이콘 URL
  Grade: string; // 아바타 등급 (예: 전설, 영웅 등)
  IsSet: boolean; // 세트 여부
  IsInner: boolean; // 내부 아바타 여부
  Tooltip: string; // JSON 형태의 문자열 툴팁
}
