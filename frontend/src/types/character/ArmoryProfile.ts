// Stat 타입
export interface Stat {
  Type: string; // 스탯 종류 (예: 치명, 특화 등)
  Value: string; // 스탯 값
  Tooltip: string[]; // 상세 설명 (HTML 형식의 문자열 배열)
}

// Tendency 타입
export interface Tendency {
  Type: string; // 성향 종류 (예: 지성, 담력 등)
  Point: number; // 현재 포인트 값
  MaxPoint: number; // 최대 포인트 값
}

// ArmoryProfile 타입
export interface ArmoryProfile {
  CharacterImage: string; // 캐릭터 이미지 URL
  ExpeditionLevel: number; // 원정대 레벨
  PvpGradeName: string; // PVP 등급
  TownLevel: number; // 마을 레벨
  TownName: string; // 마을 이름
  Title: string; // 칭호
  GuildMemberGrade: string; // 길드 내 등급 (예: 일반 길드원)
  GuildName: string; // 길드 이름
  UsingSkillPoint: number; // 사용 중인 스킬 포인트
  TotalSkillPoint: number; // 총 스킬 포인트
  Stats: Stat[]; // 캐릭터 스탯 배열
  Tendencies: Tendency[]; // 성향 배열
  ServerName: string; // 서버 이름
  CharacterName: string; // 캐릭터 이름
  CharacterLevel: number; // 캐릭터 레벨
  CharacterClassName: string; // 캐릭터 클래스 이름
  ItemAvgLevel: string; // 아이템 평균 레벨
  ItemMaxLevel: string; // 아이템 최대 레벨
}
