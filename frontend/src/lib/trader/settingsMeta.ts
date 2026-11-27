/**
 * 운영 설정(DB 에 저장, 화면에서 바꿈) — 이름·단위·설명(올리면/내리면).
 * 키는 백엔드 traderControl.service.ts 의 TUNABLE_RULES, 엔진 control.py 의 TUNABLE 과 같아야 한다.
 * 모두 엔진 재시작 없이 약 5초 안에 다음 판단부터 적용된다.
 */

export type SettingUnit = "rate" | "krw" | "bps" | "ratio" | "mult" | "enum" | "time";

export interface SettingMeta {
  key: string;
  label: string;
  unit: SettingUnit;
  meaning: string;
  up: string;
  down: string;
  options?: { value: string; label: string }[];
}

export interface SettingGroup {
  title: string;
  hint?: string;
  items: SettingMeta[];
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    title: "수수료·세금",
    hint: "비율로 입력합니다 (0.015% → 0.00015). 실계좌 전에는 실제 요율로 맞춥니다.",
    items: [
      {
        key: "commission_rate_buy",
        label: "매수 수수료율",
        unit: "rate",
        meaning: "매수할 때 붙는 수수료",
        up: "비용 증가 → 손익 악화, 비용 차감 손익비가 낮아져 매수가 더 자주 막힘",
        down: "비용이 작게 잡혀 가상매매 성과가 실제보다 좋게 보임",
      },
      {
        key: "commission_rate_sell",
        label: "매도 수수료율",
        unit: "rate",
        meaning: "매도할 때 붙는 수수료",
        up: "비용 증가 → 손익 악화, 매수가 더 자주 막힘",
        down: "성과가 실제보다 좋게 보임",
      },
      {
        key: "sell_tax_rate",
        label: "매도 세율",
        unit: "rate",
        meaning: "매도할 때만 붙는 세금 (비용 중 가장 큼)",
        up: "짧게 자주 사고파는 매매에 특히 불리",
        down: "성과가 과대평가됨",
      },
      {
        key: "fee_rounding",
        label: "원 단위 처리",
        unit: "enum",
        meaning: "수수료·세금의 원 미만 처리",
        up: "반올림: 비용이 아주 약간 크게 잡힘",
        down: "절사: 비용이 아주 약간 작게 잡힘 (1건당 1원 미만 차이)",
        options: [
          { value: "down", label: "절사 (down)" },
          { value: "half_up", label: "반올림 (half_up)" },
        ],
      },
    ],
  },
  {
    title: "가상 체결 모델",
    items: [
      {
        key: "slippage_bps",
        label: "슬리피지",
        unit: "bps",
        meaning: "시장가 체결이 현재가보다 불리하게 체결되는 폭 (1bp = 0.01%)",
        up: "성과가 보수적으로 나오고 손익비가 낮아져 매수가 줄어듦",
        down: "실제보다 유리하게 체결된 것으로 보여 성과가 부풀려짐",
      },
      {
        key: "participation_rate",
        label: "체결 비율",
        unit: "ratio",
        meaning: "체결 1건의 거래량 중 내 주문이 가져가는 비율 (0 초과 1 이하)",
        up: "빨리 다 체결됨 (1 이면 시장 거래량을 전부 가져가는 비현실적 가정)",
        down: "부분 체결·미체결이 늘어남 (보수적)",
      },
    ],
  },
  {
    title: "위험 한도",
    hint: "1회 매수 금액 ≤ 1회 주문 한도 ≤ 종목 보유 한도 여야 합니다. 보유분을 줄이는 매도는 한도로 막지 않습니다.",
    items: [
      {
        key: "strategy_order_value",
        label: "1회 매수 금액",
        unit: "krw",
        meaning: "매수 신호 때 쓸 금액. 수량 = 금액 ÷ 현재가 (1주 미만 버림)",
        up: "손익 폭 증가. 1회 주문 한도보다 크면 매수가 전부 거부됨",
        down: "1주 가격보다 작으면 그 종목은 사지 못함",
      },
      {
        key: "risk_max_order_value",
        label: "1회 주문 한도",
        unit: "krw",
        meaning: "주문 1건의 최대 금액 (전략 버그 방지)",
        up: "안전장치가 느슨해짐",
        down: "1회 매수 금액보다 작으면 매수가 전부 거부됨",
      },
      {
        key: "risk_max_position_value",
        label: "종목 보유 한도",
        unit: "krw",
        meaning: "한 종목에 보유할 수 있는 최대 금액 (보유 + 미체결 매수 + 이번 주문)",
        up: "한 종목에 몰릴 위험 증가",
        down: "추가 매수가 막힘",
      },
      {
        key: "risk_daily_loss_limit",
        label: "하루 손실 한도",
        unit: "krw",
        meaning: "오늘 시작 평가금액 대비 이만큼 잃으면 그날 신규 매수 중단",
        up: "나쁜 날 손실이 커질 수 있음",
        down: "정상적인 등락에도 매매가 멈춤",
      },
    ],
  },
  {
    title: "손절·목표가와 손익비",
    hint: "손절가 = 진입가 − ATR × 손절 배수, 목표가 = 진입가 + ATR × 목표 배수 (ATR = 1분봉 14개 평균 변동폭).",
    items: [
      {
        key: "risk_atr_stop_mult",
        label: "손절 배수",
        unit: "mult",
        meaning: "손절가까지의 거리 (ATR 배수)",
        up: "손절이 멀어져 한 번 잃을 때 크게 잃고, 손익비가 낮아짐",
        down: "손절이 가까워져 작은 흔들림에도 청산됨",
      },
      {
        key: "risk_atr_take_mult",
        label: "목표 배수",
        unit: "mult",
        meaning: "목표가까지의 거리 (ATR 배수)",
        up: "손익비가 높아지지만 목표가에 덜 닿음",
        down: "자주 닿지만 한 번에 버는 폭이 작음",
      },
      {
        key: "risk_min_risk_reward",
        label: "최소 손익비",
        unit: "mult",
        meaning: "비용 차감 (기대 이익 ÷ 감수 손실) 이 이보다 작으면 매수하지 않음. 1분봉 기준 보통 0.8~1.1",
        up: "매수가 더 드물어지고 기대 이익이 큰 자리만 들어감",
        down: "매수가 늘지만 비용을 빼면 본전도 안 되는 자리에도 들어갈 수 있음",
      },
      {
        key: "risk_max_spread_bps",
        label: "최대 스프레드",
        unit: "bps",
        meaning: "매도·매수 호가 차이가 이보다 크면 매수하지 않음",
        up: "호가가 벌어진(유동성 낮은) 순간에도 매수함",
        down: "매수 기회가 줄어듦",
      },
    ],
  },
  {
    title: "장중 시각",
    hint: "KST, HH:MM 으로 입력합니다. 비우면 끕니다. 장 시작 ≤ 신규 매수 마감 ≤ 장마감 청산 ≤ 장 마감이어야 합니다.",
    items: [
      {
        key: "entry_cutoff",
        label: "신규 매수 마감",
        unit: "time",
        meaning: "이 시각 이후로는 새로 사지 않음 (매도·청산은 계속)",
        up: "늦추면: 장 막판에 들어가 청산까지 시간이 짧은 매수가 생김",
        down: "당기면: 오후 매수 기회가 줄어듦",
      },
      {
        key: "eod_exit",
        label: "장마감 청산",
        unit: "time",
        meaning: "이 시각에 보유분을 모두 시장가로 정리 (다음 날로 넘기지 않음)",
        up: "늦추면: 마감 직전 유동성이 줄어 불리하게 체결될 수 있음",
        down: "당기면: 오른 종목도 일찍 정리됨",
      },
    ],
  },
];

export const SETTING_KEYS = SETTING_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export const UNIT_SUFFIX: Record<SettingUnit, string> = {
  rate: "",
  krw: "원",
  bps: "bp",
  ratio: "",
  mult: "배",
  enum: "",
  time: "",
};

/** 입력값 형식만 확인한다 (범위·관계는 서버와 엔진이 다시 검증한다). */
export function looksLikeDecimal(v: string): boolean {
  return /^\d{1,14}(\.\d{1,8})?$/.test(v.trim());
}

/** "15:00" · "15:00:00" (KST) */
export function looksLikeTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v.trim());
}
