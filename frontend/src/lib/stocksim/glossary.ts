/**
 * 모의투자 용어집 — 매매 신호·투자 지표·재무 지표 화면이 같이 쓴다.
 *
 * 각 용어는 뜻(definition), 계산식(formula), 읽는 법(howToRead)을 갖는다.
 * 화면의 지표 이름과 같은 키로 찾으므로(`glossaryTerm("PER")`), 이름을 바꾸면 여기 키도 함께 바꾼다.
 */

export type GlossaryGroup = "signal" | "valuation";

export type GlossaryTerm = {
  term: string;
  group: GlossaryGroup;
  definition: string;
  formula?: string;
  howToRead: string;
};

export const GLOSSARY: GlossaryTerm[] = [
  // --- 매매 신호 ---------------------------------------------------------------
  {
    term: "이동평균",
    group: "signal",
    definition: "최근 N일 종가의 평균입니다. 5·20일은 단기, 60일은 중기, 120일은 장기 흐름을 볼 때 씁니다.",
    formula: "N일 이동평균 = 최근 N일 종가 합 ÷ N",
    howToRead: "현재가가 이동평균 위에 있으면 그 기간 동안 오른 흐름, 아래에 있으면 내린 흐름으로 봅니다.",
  },
  {
    term: "정배열·역배열",
    group: "signal",
    definition: "단기 이동평균이 장기보다 위에 차례로 놓인 상태가 정배열, 반대가 역배열입니다.",
    howToRead: "정배열은 상승 추세, 역배열은 하락 추세가 이어지고 있다는 뜻입니다. 섞여 있으면 추세가 뚜렷하지 않습니다.",
  },
  {
    term: "골든크로스·데드크로스",
    group: "signal",
    definition: "단기 이동평균이 장기 이동평균을 아래에서 위로 뚫으면 골든크로스, 위에서 아래로 뚫으면 데드크로스입니다.",
    howToRead: "골든크로스는 상승 전환, 데드크로스는 하락 전환 신호로 봅니다. 횡보장에서는 자주 엇갈려 거짓 신호가 많습니다.",
  },
  {
    term: "RSI",
    group: "signal",
    definition: "상대강도지수. 일정 기간 동안 오른 폭과 내린 폭을 비교해 0~100 으로 나타냅니다 (여기서는 14일).",
    formula: "RSI = 평균 상승폭 ÷ (평균 상승폭 + 평균 하락폭) × 100",
    howToRead: "70 이상이면 과매수(과열), 30 이하면 과매도로 봅니다. 강한 추세에서는 그 구간에 오래 머물 수 있습니다.",
  },
  {
    term: "MACD",
    group: "signal",
    definition: "단기(12일)와 장기(26일) 지수이동평균의 차이입니다. 시그널선은 MACD 의 9일 지수이동평균입니다.",
    formula: "MACD = 12일 EMA - 26일 EMA, 시그널 = MACD 의 9일 EMA",
    howToRead: "MACD 가 시그널선 위면 상승 힘, 아래면 하락 힘이 셉니다. 위로 교차하면 매수, 아래로 교차하면 매도 신호로 봅니다.",
  },
  {
    term: "지수이동평균 (EMA)",
    group: "signal",
    definition: "최근 가격에 더 큰 가중치를 두는 이동평균입니다. 단순 이동평균보다 가격 변화에 빨리 반응합니다.",
    howToRead: "MACD 처럼 추세 전환을 빨리 잡고 싶을 때 씁니다.",
  },
  {
    term: "볼린저밴드",
    group: "signal",
    definition: "20일 이동평균(중심선)에 표준편차의 2배를 더하고 뺀 위·아래 띠입니다. 가격의 약 95% 가 띠 안에 있다고 봅니다.",
    formula: "상단·하단 = 20일 이동평균 ± 2 × 20일 표준편차",
    howToRead: "띠 하단 아래는 과매도, 상단 위는 과열로 봅니다. 띠 폭이 좁아진 뒤에는 큰 움직임이 나오는 경우가 많습니다.",
  },
  {
    term: "%B",
    group: "signal",
    definition: "볼린저밴드 안에서 현재가의 위치입니다.",
    formula: "%B = (현재가 - 하단) ÷ (상단 - 하단)",
    howToRead: "0 이면 하단, 1 이면 상단, 0.5 면 중심선입니다. 0 미만·1 초과는 띠 밖입니다.",
  },
  {
    term: "52주 범위",
    group: "signal",
    definition: "최근 1년(52주) 동안의 최저가~최고가입니다.",
    formula: "범위 안 위치 = (현재가 - 52주 최저) ÷ (52주 최고 - 52주 최저)",
    howToRead: "0% 에 가까우면 1년 중 저점, 100% 에 가까우면 고점 부근입니다.",
  },
  {
    term: "최대낙폭 (MDD)",
    group: "signal",
    definition: "기간 중 가장 높았던 가격에서 가장 많이 떨어졌던 비율입니다.",
    formula: "MDD = (고점 이후 최저가 - 고점) ÷ 고점",
    howToRead: "이 종목을 들고 있었다면 겪을 수 있었던 최악의 손실 폭입니다. 클수록 변동이 큰 종목입니다.",
  },
  {
    term: "순매수",
    group: "signal",
    definition: "같은 기간 동안 산 수량(또는 금액)에서 판 수량을 뺀 값입니다. 음수면 순매도입니다.",
    formula: "순매수 = 매수 - 매도",
    howToRead: "외국인·기관이 꾸준히 순매수하면 수급이 좋다고 봅니다. 하루 평균 거래량과 비교하면 크기를 가늠할 수 있습니다.",
  },
  {
    term: "공매도 비중",
    group: "signal",
    definition: "공매도는 주식을 빌려 먼저 판 뒤 나중에 사서 갚는 거래입니다. 비중은 전체 거래량 중 공매도 거래량의 비율입니다.",
    formula: "공매도 비중 = 공매도 거래량 ÷ 전체 거래량",
    howToRead: "높을수록 가격 하락을 예상하는 거래가 많다는 뜻입니다. 쌓인 공매도가 많으면 숏커버링으로 급등하기도 합니다.",
  },

  // --- 투자 지표 · 재무 지표 ---------------------------------------------------
  {
    term: "PER",
    group: "valuation",
    definition: "주가수익비율. 주가가 1주당 1년 이익의 몇 배인지 나타냅니다.",
    formula: "PER = 주가 ÷ EPS",
    howToRead: "낮을수록 이익에 비해 싸다고 봅니다. 업종마다 평균이 크게 달라 같은 업종끼리 비교합니다. 적자면 계산하지 않습니다.",
  },
  {
    term: "PBR",
    group: "valuation",
    definition: "주가순자산비율. 주가가 1주당 순자산(자산 - 부채)의 몇 배인지 나타냅니다.",
    formula: "PBR = 주가 ÷ BPS",
    howToRead: "1배 미만이면 장부상 순자산보다 싸게 거래된다는 뜻입니다. 수익성(ROE)이 낮은 회사는 낮게 유지되기도 합니다.",
  },
  {
    term: "EPS",
    group: "valuation",
    definition: "주당순이익. 1년 동안 번 순이익을 주식 1주당으로 나눈 값입니다.",
    formula: "EPS = 지배주주 순이익 ÷ 발행주식수",
    howToRead: "꾸준히 늘어나는지가 중요합니다. 0 이하면 적자입니다.",
  },
  {
    term: "BPS",
    group: "valuation",
    definition: "주당순자산. 회사의 순자산(자본총계)을 주식 1주당으로 나눈 값입니다.",
    formula: "BPS = 자본총계 ÷ 발행주식수",
    howToRead: "회사를 지금 청산하면 1주당 받을 수 있는 장부상 금액으로 볼 수 있습니다.",
  },
  {
    term: "ROE",
    group: "valuation",
    definition: "자기자본이익률. 주주가 맡긴 돈(자본)으로 1년에 얼마를 벌었는지 나타냅니다.",
    formula: "ROE = 당기순이익 ÷ 자본총계",
    howToRead: "보통 10% 이상이면 양호, 15% 이상이면 높다고 봅니다. 부채를 많이 써도 높아질 수 있어 부채비율과 함께 봅니다.",
  },
  {
    term: "영업이익률",
    group: "valuation",
    definition: "매출 중 본업에서 남긴 이익(영업이익)의 비율입니다.",
    formula: "영업이익률 = 영업이익 ÷ 매출액",
    howToRead: "높을수록 본업의 돈 버는 힘이 강합니다. 같은 업종 회사와 비교합니다.",
  },
  {
    term: "순이익률",
    group: "valuation",
    definition: "매출 중 최종적으로 남은 이익(당기순이익)의 비율입니다.",
    formula: "순이익률 = 당기순이익 ÷ 매출액",
    howToRead: "영업이익률보다 크게 높거나 낮으면 이자·환율·자산 매각 같은 영업 밖 손익이 컸다는 뜻입니다.",
  },
  {
    term: "부채비율",
    group: "valuation",
    definition: "자본 대비 부채의 비율로, 재무 안정성을 봅니다.",
    formula: "부채비율 = 부채총계 ÷ 자본총계",
    howToRead: "낮을수록 안정적입니다. 보통 100%(부채 = 자본) 이하를 무난하게 보지만 금융·건설 등 업종마다 다릅니다.",
  },
  {
    term: "배당수익률",
    group: "valuation",
    definition: "현재 주가로 샀을 때 1년 배당으로 받는 돈의 비율입니다.",
    formula: "배당수익률 = 주당배당금 ÷ 주가",
    howToRead: "예금 금리와 비교해 볼 수 있습니다. 주가가 크게 내려 일시적으로 높아진 경우도 있으니 배당이 꾸준한지 함께 봅니다.",
  },
  {
    term: "주당배당금",
    group: "valuation",
    definition: "보통주 1주당 1년 동안 지급한 현금배당입니다.",
    howToRead: "해마다 늘거나 유지되는지가 중요합니다.",
  },
  {
    term: "시가총액",
    group: "valuation",
    definition: "시장에서 매겨진 회사 전체의 가격입니다.",
    formula: "시가총액 = 현재가 × 상장주식수",
    howToRead: "회사 규모를 비교할 때 씁니다. 매출·이익과 견주면 비싼지 싼지 가늠할 수 있습니다.",
  },
  {
    term: "매출액",
    group: "valuation",
    definition: "1년 동안 물건·서비스를 팔아 벌어들인 총액입니다.",
    howToRead: "회사가 커지고 있는지를 가장 먼저 보여줍니다. 전년 대비 증감률을 함께 봅니다.",
  },
  {
    term: "영업이익",
    group: "valuation",
    definition: "매출에서 원가와 판매·관리비를 뺀, 본업으로 번 이익입니다.",
    formula: "영업이익 = 매출액 - 매출원가 - 판매비와관리비",
    howToRead: "본업의 수익성을 보여줍니다. 매출보다 빠르게 늘면 수익성이 좋아지고 있다는 뜻입니다.",
  },
  {
    term: "당기순이익",
    group: "valuation",
    definition: "영업이익에 이자·환율·투자 손익 등을 더하고 법인세를 뺀 최종 이익입니다.",
    howToRead: "EPS·ROE 계산의 바탕입니다. 일회성 손익으로 크게 흔들릴 수 있어 영업이익과 함께 봅니다.",
  },
  {
    term: "자산총계",
    group: "valuation",
    definition: "회사가 가진 모든 재산(현금, 공장, 재고, 투자자산 등)의 합입니다.",
    formula: "자산총계 = 부채총계 + 자본총계",
    howToRead: "회사의 규모를 보여줍니다. 부채로 늘었는지, 자본으로 늘었는지를 함께 봅니다.",
  },
  {
    term: "부채총계",
    group: "valuation",
    definition: "회사가 갚아야 할 돈(차입금, 매입채무 등)의 합입니다.",
    howToRead: "자본과 비교한 부채비율로 안정성을 판단합니다.",
  },
  {
    term: "자본총계",
    group: "valuation",
    definition: "자산에서 부채를 뺀, 주주 몫의 순자산입니다.",
    formula: "자본총계 = 자산총계 - 부채총계",
    howToRead: "꾸준히 늘면 이익이 쌓이고 있다는 뜻입니다. BPS·ROE·부채비율 계산에 씁니다.",
  },
  {
    term: "연결·별도 재무제표",
    group: "valuation",
    definition: "연결은 자회사까지 합친 그룹 전체, 별도는 회사 하나만의 재무제표입니다.",
    howToRead: "자회사가 있는 회사는 연결 기준이 실제 규모를 더 잘 보여줍니다. 여기서는 연결이 있으면 연결을 씁니다.",
  },
  {
    term: "사업보고서",
    group: "valuation",
    definition: "상장사가 1년에 한 번 금융감독원 전자공시(DART)에 내는 연간 보고서입니다.",
    howToRead: "재무 지표는 가장 최근 사업보고서(지난해 실적) 기준이라 올해 실적은 아직 반영되지 않았습니다.",
  },
  {
    term: "52주 최고·최저",
    group: "valuation",
    definition: "최근 1년 동안 가장 높았던·낮았던 가격입니다.",
    howToRead: "현재가가 1년 범위에서 어디쯤인지 가늠할 때 씁니다.",
  },
  {
    term: "상장주식수",
    group: "valuation",
    definition: "증권시장에서 거래되는 이 종목의 주식 수입니다.",
    howToRead: "시가총액·EPS·BPS 를 1주당으로 나눌 때 씁니다. 증자·소각으로 바뀝니다.",
  },
];

const BY_TERM = new Map(GLOSSARY.map((t) => [t.term, t]));

/** 화면 지표 이름 → 용어집 항목 (이름이 다르게 붙은 경우 포함) */
const ALIASES: Record<string, string> = {
  "52주 최고": "52주 최고·최저",
  "52주 최저": "52주 최고·최저",
  "52주 범위 위치": "52주 범위",
  "이동평균 배열": "정배열·역배열",
  "120일선 대비": "이동평균",
  "20·60일선 교차": "골든크로스·데드크로스",
  "RSI(14)": "RSI",
  "MACD(12,26,9)": "MACD",
  "볼린저밴드(20,2)": "볼린저밴드",
  "1년 수익률·최대낙폭": "최대낙폭 (MDD)",
  "외국인 수급": "순매수",
  "기관 수급": "순매수",
  "EPS (주당순이익)": "EPS",
  "BPS (주당순자산)": "BPS",
};

export function glossaryTerm(name: string): GlossaryTerm | undefined {
  return BY_TERM.get(name) ?? BY_TERM.get(ALIASES[name] ?? "");
}

export function glossaryGroup(group: GlossaryGroup): GlossaryTerm[] {
  return GLOSSARY.filter((t) => t.group === group);
}
