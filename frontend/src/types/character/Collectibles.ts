// CollectiblePoint 타입 정의
export interface CollectiblePoint {
  PointName: string; // 포인트 이름 (예: '아르테미스', '루테란 서부')
  Point: number; // 현재 포인트
  MaxPoint: number; // 최대 포인트
}

// Collectible 타입 정의
export interface Collectible {
  Type: string; // 수집 가능한 아이템의 종류 (예: '모코코 씨앗', '위대한 미술품')
  Icon: string; // 아이콘 이미지 URL
  Point: number; // 현재 포인트
  MaxPoint: number; // 최대 포인트
  CollectiblePoints: CollectiblePoint[]; // 수집 가능한 각 포인트들의 배열
}
