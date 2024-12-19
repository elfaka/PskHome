export interface Element {
  type: string;
  value:
    | string
    | ItemTitle
    | ItemPartBox
    | Progress
    | IndentStringGroup
    | ShowMeTheMoney;
}

export interface ItemTitle {
  bEquip: number;
  leftStr0: string;
  leftStr1: string;
  leftStr2: string;
  qualityValue: number;
  rightStr0: string;
  slotData: SlotData | null | undefined;
}

export interface SlotData {
  advBookIcon: number;
  battleItemTypeIcon: number;
  blackListIcon: number;
  cardIcon: boolean;
  friendship: number;
  iconGrade: number;
  iconPath: string;
  imagePath: string;
  islandIcon: number;
  petBorder: number;
  rtString: string;
  seal: boolean;
  temporary: number;
  town: number;
  trash: number;
}

export interface ItemPartBox {
  Element_000: string;
  Element_001: string;
}

export interface Progress {
  forceValue: string;
  maximum: number;
  minimum: number;
  title: string;
  value: number;
  valueType: number;
}

export interface IndentStringGroup {
  Element_000: {
    contentStr: ContentStr[];
    topStr: string;
  };
}

export interface ContentStr {
  bPoint: boolean;
  contentStr: string;
}

export interface ShowMeTheMoney {
  value: string;
}

export interface EquipmentTooltip {
  Element_000: Element | null | undefined;
  Element_001: Element | null | undefined;
  Element_002: Element | null | undefined;
  Element_003: Element | null | undefined;
  Element_004: Element | null | undefined;
  Element_005: Element | null | undefined;
  Element_006: Element | null | undefined;
  Element_007: Element | null | undefined;
  Element_008: Element | null | undefined;
  Element_009: Element | null | undefined;
  Element_010: Element | null | undefined;
  Element_011: Element | null | undefined;
  Element_012: Element | null | undefined;
  Element_013: Element | null | undefined;
  Element_014: Element | null | undefined;
}
