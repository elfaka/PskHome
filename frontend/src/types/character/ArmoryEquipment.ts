// ArmoryEquipment 인터페이스
export interface ArmoryEquipment {
  Type: string; // 장비 타입 (예: 무기, 투구, 상의 등)
  Name: string; // 장비 이름
  Icon: string; // 장비 아이콘 URL
  Grade: string; // 장비 등급 (예: 고대)
  Tooltip: string; // Tooltip은 JSON 문자열 형태
}
