/**
 * 매매 신호 항목별 설명 — 무엇을 보는 지표인지, 점수 기준표, 해석할 때 주의점.
 *
 * 기준표의 `points` 는 analysis.service.ts 의 실제 점수 규칙과 같아야 한다.
 * (규칙을 바꾸면 여기와 analysis.service.test.ts 를 함께 고친다)
 * `id` 는 같은 점수가 두 줄일 때(PER 적자 / 35배 이상) 어느 줄인지 지정하는 데 쓴다.
 */

export interface GuideRule {
  id?: string;
  condition: string;
  points: number;
}

export interface FactorGuide {
  description: string;
  rules: GuideRule[];
  caution: string;
}

export const FACTOR_GUIDE: Record<string, FactorGuide> = {
  "ma-alignment": {
    description:
      "이동평균은 최근 N일 종가의 평균입니다. 5·20·60·120일 이동평균이 짧은 것부터 위에 차례로 놓이면(정배열) 최근 가격이 계속 높아지고 있다는 뜻이라 상승 추세로, 반대 순서(역배열)면 하락 추세로 봅니다.",
    rules: [
      { condition: "정배열 (5일 > 20일 > 60일 > 120일)", points: 10 },
      { condition: "순서가 엇갈림 (뚜렷한 추세 없음)", points: 0 },
      { condition: "역배열 (5일 < 20일 < 60일 < 120일)", points: -10 },
    ],
    caution: "이동평균은 지난 가격의 평균이라 추세 전환을 늦게 알려 줍니다. 급등락 직후에는 배열이 아직 바뀌지 않았을 수 있습니다.",
  },
  ma120: {
    description:
      "120일 이동평균은 약 6개월 동안의 평균 가격으로, 장기 추세의 기준선으로 많이 씁니다. 현재가가 이 선 위에 있으면 장기적으로 오르는 흐름, 아래에 있으면 내리는 흐름으로 봅니다.",
    rules: [
      { condition: "현재가 ≥ 120일 이동평균", points: 8 },
      { condition: "현재가 < 120일 이동평균", points: -8 },
    ],
    caution: "선 근처에서 오르내리는 동안에는 점수가 자주 바뀝니다. 얼마나 떨어져 있는지(괴리율)도 함께 보세요.",
  },
  "ma-cross": {
    description:
      "20일선(단기)이 60일선(중기)을 아래에서 위로 뚫으면 골든크로스, 위에서 아래로 뚫으면 데드크로스라고 합니다. 단기 흐름이 중기 흐름을 앞지르거나 밑돌기 시작했다는 신호로 씁니다. 최근 10거래일 안의 교차만 봅니다.",
    rules: [
      { condition: "최근 10거래일 안에 골든크로스", points: 10 },
      { condition: "최근 10거래일 안에 교차 없음", points: 0 },
      { condition: "최근 10거래일 안에 데드크로스", points: -10 },
    ],
    caution: "횡보장에서는 두 선이 자주 엇갈려 거짓 신호가 많습니다. 교차 뒤 거래량과 추세가 이어지는지 확인하세요.",
  },
  rsi: {
    description:
      "RSI(상대강도지수)는 최근 14일 동안 오른 폭과 내린 폭을 비교해 0~100 으로 나타낸 값입니다. RSI = 평균 상승폭 ÷ (평균 상승폭 + 평균 하락폭) × 100. 70 이상이면 많이 올라 과열(과매수), 30 이하면 많이 내려 과매도로 봅니다.",
    rules: [
      { condition: "30 미만 (과매도)", points: 15 },
      { condition: "30 이상 45 미만 (약세)", points: 5 },
      { condition: "45 이상 55 이하 (중립)", points: 0 },
      { condition: "55 초과 70 이하 (강세)", points: -5 },
      { condition: "70 초과 (과매수)", points: -15 },
    ],
    caution: "과매도는 반등 가능성을 뜻할 뿐입니다. 강한 하락 추세에서는 RSI 가 30 아래에 오래 머물며 더 내려갈 수 있습니다 (과매수도 마찬가지).",
  },
  macd: {
    description:
      "MACD 는 12일 지수이동평균에서 26일 지수이동평균을 뺀 값이고, 시그널선은 MACD 의 9일 지수이동평균입니다. MACD 가 시그널선 위면 상승 힘이, 아래면 하락 힘이 세다고 보며, 두 선이 교차하는 순간을 매수·매도 신호로 씁니다.",
    rules: [
      { condition: "최근 5거래일 안에 MACD 가 시그널선을 위로 교차", points: 12 },
      { condition: "MACD 가 시그널선 위", points: 8 },
      { condition: "MACD 와 시그널선이 같음", points: 0 },
      { condition: "MACD 가 시그널선 아래", points: -8 },
      { condition: "최근 5거래일 안에 MACD 가 시그널선을 아래로 교차", points: -12 },
    ],
    caution: "이동평균으로 만든 지표라 신호가 늦게 나오고, 횡보장에서는 교차가 잦아 거짓 신호가 많습니다.",
  },
  momentum12: {
    description:
      "약 12개월(252거래일) 전 종가에서 약 1개월(21거래일) 전 종가까지의 수익률입니다(12-1 모멘텀). 지난 1년 동안 강했던 종목이 이후에도 한동안 강한 경향(모멘텀 효과)을 이용하며, 최근 1개월은 단기 되돌림 영향이 커서 뺍니다.",
    rules: [
      { condition: "+30% 이상", points: 8 },
      { condition: "+10% 이상 +30% 미만", points: 4 },
      { condition: "-10% 초과 +10% 미만", points: 0 },
      { condition: "-30% 초과 -10% 이하", points: -4 },
      { condition: "-30% 이하", points: -8 },
    ],
    caution: "시장이 급반등할 때는 그동안 많이 빠졌던 종목이 더 크게 오르면서 모멘텀 전략이 크게 손실을 보기도 합니다(모멘텀 붕괴).",
  },
  bollinger: {
    description:
      "볼린저밴드는 20일 이동평균(중심선)에 위아래로 표준편차의 2배를 더하고 뺀 띠입니다. 가격의 약 95% 가 이 띠 안에 머문다고 봅니다. %B = (현재가 - 하단) ÷ (상단 - 하단) 로 띠 안 위치를 0(하단)~1(상단)로 나타냅니다.",
    rules: [
      { condition: "%B < 0 (하단 아래, 과매도)", points: 10 },
      { condition: "0 ≤ %B < 0.2 (하단 부근)", points: 5 },
      { condition: "0.2 ≤ %B ≤ 0.8 (중간)", points: 0 },
      { condition: "0.8 < %B ≤ 1 (상단 부근)", points: -5 },
      { condition: "%B > 1 (상단 위, 과열)", points: -10 },
    ],
    caution: "강한 추세에서는 가격이 띠 상단(또는 하단)을 따라 계속 움직이기도 합니다. 띠 폭이 좁아진 뒤에는 큰 움직임이 나오는 경우가 많습니다.",
  },
  range52w: {
    description:
      "최근 1년(52주) 동안의 최저가~최고가 사이에서 현재가가 어디쯤인지 봅니다. 위치 = (현재가 - 52주 최저) ÷ (52주 최고 - 52주 최저). 52주 고가 근처 종목이 이후에도 상대적으로 강했다는 연구(52주 고가 모멘텀)를 따라 고가 근처를 강세로 봅니다.",
    rules: [
      { condition: "범위의 90% 이상 (고가 부근)", points: 6 },
      { condition: "범위의 70% 이상 90% 미만", points: 3 },
      { condition: "범위의 20% 초과 70% 미만", points: 0 },
      { condition: "범위의 20% 이하 (저가 부근)", points: -4 },
    ],
    caution: "고가 근처는 추세가 이어지는 경우가 많지만, 단기 급등 직후에는 되돌림도 큽니다. RSI·볼린저밴드의 과열 신호와 함께 보세요.",
  },
  return1y: {
    description:
      "1년 수익률은 1년 전 종가 대비 현재가의 변화율입니다. 최대낙폭(MDD)은 그 기간 중 가장 높았던 가격에서 가장 많이 떨어졌던 비율로, 이 종목을 들고 있었을 때 겪을 수 있었던 최악의 손실을 보여줍니다.",
    rules: [],
    caution: "점수에는 넣지 않는 참고 지표입니다. 지난 수익률이 앞으로의 수익률을 보장하지 않습니다.",
  },
  foreigner: {
    description:
      "외국인 투자자가 최근 20거래일 동안 이 종목을 산 수량에서 판 수량을 뺀 값(순매수)입니다. 종목마다 거래량이 달라, 순매수 수량을 최근 20일 하루 평균 거래량으로 나눈 배수로 비교합니다.",
    rules: [
      { condition: "순매수가 하루 평균 거래량의 0.5배 초과", points: 8 },
      { condition: "순매수 (0 ~ 0.5배)", points: 4 },
      { condition: "순매수·순매도 없음", points: 0 },
      { condition: "순매도 (0 ~ 0.5배)", points: -4 },
      { condition: "순매도가 하루 평균 거래량의 0.5배 초과", points: -8 },
    ],
    caution: "외국인 매매에는 환율·지수 편입 같은 종목 밖 이유도 많습니다. 당일 값은 장 마감 전까지 잠정치입니다.",
  },
  institution: {
    description:
      "기관 투자자(연기금·투신·보험·금융투자 등)가 최근 20거래일 동안 산 수량에서 판 수량을 뺀 값(순매수)입니다. 하루 평균 거래량으로 나눈 배수로 비교합니다.",
    rules: [
      { condition: "순매수가 하루 평균 거래량의 0.5배 초과", points: 8 },
      { condition: "순매수 (0 ~ 0.5배)", points: 4 },
      { condition: "순매수·순매도 없음", points: 0 },
      { condition: "순매도 (0 ~ 0.5배)", points: -4 },
      { condition: "순매도가 하루 평균 거래량의 0.5배 초과", points: -8 },
    ],
    caution: "기관 매매에는 펀드 환매·리밸런싱처럼 종목 판단과 무관한 매매도 섞여 있습니다.",
  },
  short: {
    description:
      "공매도는 주식을 빌려서 먼저 판 뒤 나중에 사서 갚는 거래로, 가격이 내릴 것으로 보는 투자자가 씁니다. 공매도 비중 = 공매도 거래량 ÷ 전체 거래량. 최근 거래일 평균으로 봅니다.",
    rules: [
      { condition: "평균 2% 미만 (낮음)", points: 2 },
      { condition: "평균 2% 이상 5% 이하 (보통)", points: 0 },
      { condition: "평균 5% 초과 10% 이하 (다소 높음)", points: -3 },
      { condition: "평균 10% 초과 (높음)", points: -6 },
    ],
    caution: "공매도가 많이 쌓인 종목은 가격이 오르면 빌린 주식을 갚으려는 매수(숏커버링)로 급등하기도 합니다.",
  },
  per: {
    description:
      "PER(주가수익비율) = 주가 ÷ 주당순이익(EPS). 회사가 1년에 버는 이익의 몇 배에 주식이 거래되는지 보여줍니다. 낮을수록 이익에 비해 주가가 싸다고 봅니다.",
    rules: [
      { condition: "8배 미만", points: 8 },
      { condition: "8배 이상 12배 미만", points: 5 },
      { condition: "12배 이상 20배 미만", points: 0 },
      { condition: "20배 이상 35배 미만", points: -4 },
      { id: "high", condition: "35배 이상", points: -8 },
      { id: "loss", condition: "적자 (EPS ≤ 0, PER 계산 불가)", points: -8 },
      { id: "trap", condition: "저평가 구간이지만 영업이익이 전년보다 10% 넘게 감소 (가치 함정 보정)", points: 0 },
    ],
    caution: "업종마다 평균 PER 이 크게 다릅니다 (성장주는 높고 경기민감주는 낮음). 지난해 이익 기준이라 올해 이익이 크게 바뀌면 의미가 달라집니다.",
  },
  pbr: {
    description:
      "PBR(주가순자산비율) = 주가 ÷ 주당순자산(BPS). 회사가 가진 순자산(자산 - 부채)의 몇 배에 주식이 거래되는지 보여줍니다. 1배 미만이면 장부상 순자산보다 싸게 거래된다는 뜻입니다.",
    rules: [
      { condition: "0.7배 미만", points: 6 },
      { condition: "0.7배 이상 1배 미만", points: 4 },
      { condition: "1배 이상 2배 미만", points: 0 },
      { condition: "2배 이상 4배 미만", points: -3 },
      { condition: "4배 이상", points: -6 },
      { id: "trap", condition: "저평가 구간이지만 영업이익이 전년보다 10% 넘게 감소 (가치 함정 보정)", points: 0 },
    ],
    caution: "수익성이 낮은 회사는 PBR 이 낮게 유지되기도 합니다. ROE 와 함께 보는 것이 좋습니다.",
  },
  "op-margin": {
    description: "영업이익률 = 영업이익 ÷ 매출액. 매출 중 본업으로 남긴 이익의 비율로, 회사의 기본 체력(퀄리티)을 봅니다.",
    rules: [
      { condition: "20% 이상", points: 4 },
      { condition: "10% 이상 20% 미만", points: 2 },
      { condition: "0% 이상 10% 미만", points: 0 },
      { condition: "0% 미만 (영업 적자)", points: -4 },
    ],
    caution: "유통·건설처럼 원래 이익률이 낮은 업종이 있어 같은 업종끼리 비교하는 것이 좋습니다.",
  },
  "debt-ratio": {
    description: "부채비율 = 부채총계 ÷ 자본총계. 자본 대비 빚이 얼마나 많은지로 재무 안정성을 봅니다.",
    rules: [
      { condition: "50% 미만", points: 3 },
      { condition: "50% 이상 100% 미만", points: 1 },
      { condition: "100% 이상 200% 미만", points: 0 },
      { condition: "200% 이상", points: -3 },
    ],
    caution: "은행·보험·증권(금융업)과 건설·항공 등은 사업 구조상 부채비율이 높게 나옵니다. 이런 업종에는 이 기준이 맞지 않습니다.",
  },
  "revenue-growth": {
    description: "최근 사업연도 매출이 전년보다 얼마나 늘었는지(전년 대비 증감률)입니다. 회사가 커지고 있는지를 보여주는 성장 팩터입니다.",
    rules: [
      { condition: "+20% 이상", points: 6 },
      { condition: "+5% 이상 +20% 미만", points: 3 },
      { condition: "-5% 초과 +5% 미만", points: 0 },
      { condition: "-20% 초과 -5% 이하", points: -3 },
      { condition: "-20% 이하", points: -6 },
    ],
    caution: "사업보고서(연간) 기준이라 이미 지난 실적입니다. 인수합병으로 매출이 한 번에 늘어난 경우도 있습니다.",
  },
  "op-growth": {
    description: "최근 사업연도 영업이익이 전년보다 얼마나 늘었는지입니다. 적자에서 흑자로 돌아섰거나 올해 적자인 경우는 따로 봅니다.",
    rules: [
      { condition: "+30% 이상", points: 8 },
      { condition: "+10% 이상 +30% 미만", points: 4 },
      { condition: "-10% 초과 +10% 미만", points: 0 },
      { condition: "-30% 초과 -10% 이하", points: -4 },
      { condition: "-30% 이하", points: -8 },
      { id: "turnaround", condition: "흑자 전환 (전년 적자 → 올해 흑자)", points: 8 },
      { id: "loss", condition: "올해 영업 적자", points: -8 },
    ],
    caution: "반도체·철강·화학처럼 업황을 크게 타는 업종은 이익이 해마다 크게 출렁여, 이익이 가장 많이 늘었을 때가 업황 고점인 경우가 많습니다.",
  },
  roe: {
    description:
      "ROE(자기자본이익률) = 당기순이익 ÷ 자본총계. 주주가 맡긴 돈(자본)으로 1년에 얼마를 벌었는지 보여주는 수익성 지표입니다.",
    rules: [
      { condition: "15% 이상 (높음)", points: 6 },
      { condition: "8% 이상 15% 미만 (양호)", points: 3 },
      { condition: "0% 이상 8% 미만 (보통)", points: 0 },
      { condition: "0% 미만 (순손실)", points: -6 },
    ],
    caution: "부채를 많이 써도 ROE 가 높아질 수 있어 부채비율과 함께 봐야 합니다. 일회성 이익으로 한 해만 높을 수도 있습니다.",
  },
};
