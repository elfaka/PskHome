// Card 항목 타입
export interface CardItem {
  Name: string; // 카드 이름
  Description: string; // 카드 효과 설명
}

// Card 효과 타입
export interface CardEffect {
  Index: number; // 카드 효과 인덱스
  CardSlots: number[]; // 카드 슬롯 배열
  Items: CardItem[]; // 카드 효과 항목들
}

// 카드 타입
export interface Card {
  Slot: number; // 카드 슬롯 번호
  Name: string; // 카드 이름
  Icon: string; // 카드 아이콘 URL
  AwakeCount: number; // 각성 횟수
  AwakeTotal: number; // 각성 총 합
  Grade: string; // 카드 등급 (예: 전설)
  Tooltip: string; // 카드 상세 툴팁 (JSON 문자열)
}

export interface ArmoryCard {
  Cards: Card[];
  Effects: CardEffect[];
}
