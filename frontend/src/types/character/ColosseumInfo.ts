// Competitive 타입 정의
export interface Competitive {
  Rank: number; // 랭크
  RankName: string; // 랭크 이름
  RankIcon: string; // 랭크 아이콘 URL
  RankLastMmr: number; // 마지막 MMR 점수
  PlayCount: number; // 플레이 횟수
  VictoryCount: number; // 승리 횟수
  LoseCount: number; // 패배 횟수
  TieCount: number; // 무승부 횟수
  KillCount: number; // 킬 횟수
  AceCount: number; // 에이스 횟수
  DeathCount: number; // 사망 횟수
}

// TeamDeathmatch 타입 정의
export interface TeamDeathmatch {
  PlayCount: number; // 플레이 횟수
  VictoryCount: number; // 승리 횟수
  LoseCount: number; // 패배 횟수
  TieCount: number; // 무승부 횟수
  KillCount: number; // 킬 횟수
  AceCount: number; // 에이스 횟수
  DeathCount: number; // 사망 횟수
}

// TeamElimination 타입 정의
export interface TeamElimination {
  FirstWinCount: number; // 1위 횟수
  SecondWinCount: number; // 2위 횟수
  ThirdWinCount: number; // 3위 횟수
  FirstPlayCount: number; // 1위 플레이 횟수
  SecondPlayCount: number; // 2위 플레이 횟수
  ThirdPlayCount: number; // 3위 플레이 횟수
  AllKillCount: number; // 전체 킬 횟수
  PlayCount: number; // 플레이 횟수
  VictoryCount: number; // 승리 횟수
  LoseCount: number; // 패배 횟수
  TieCount: number; // 무승부 횟수
  KillCount: number; // 킬 횟수
  AceCount: number; // 에이스 횟수
  DeathCount: number; // 사망 횟수
}

// CoOpBattle 타입 정의
export interface CoOpBattle {
  PlayCount: number; // 플레이 횟수
  VictoryCount: number; // 승리 횟수
  LoseCount: number; // 패배 횟수
  TieCount: number; // 무승부 횟수
  KillCount: number; // 킬 횟수
  AceCount: number; // 에이스 횟수
  DeathCount: number; // 사망 횟수
}

// OneDeathmatch 타입 정의
export interface OneDeathmatch {
  KillCount: number; // 킬 횟수
  DeathCount: number; // 사망 횟수
  AllKillCount: number; // 전체 킬 횟수
  OutDamage: number; // 피해량
  InDamage: number; // 받는 피해량
  FirstWinCount: number; // 1위 횟수
  SecondWinCount: number; // 2위 횟수
  ThirdWinCount: number; // 3위 횟수
  FirstPlayCount: number; // 1위 플레이 횟수
  SecondPlayCount: number; // 2위 플레이 횟수
  ThirdPlayCount: number; // 3위 플레이 횟수
}

// Colosseum 타입 정의
export interface Colosseum {
  SeasonName: string; // 시즌 이름
  Competitive: Competitive; // 경쟁 모드 정보
  TeamDeathmatch: TeamDeathmatch; // 팀 데스매치 모드 정보
  TeamElimination: TeamElimination; // 팀 엘리미네이션 모드 정보
  CoOpBattle: CoOpBattle; // 협동 배틀 모드 정보
  OneDeathmatch: OneDeathmatch; // 1인 데스매치 모드 정보
}

// ColosseumInfo 타입 정의
export interface ColosseumInfo {
  Rank: number; // 현재 랭크
  PreRank: number; // 이전 랭크
  Exp: number; // 경험치
  Colosseums: Colosseum[]; // 시즌별 Colosseum 정보 배열
}
