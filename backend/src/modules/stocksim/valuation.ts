import type { DartFinancials } from "./dart/dartClient.js";
import { getDartClient } from "./dart/dartClient.js";
import type { TossStock } from "./toss/toss.types.js";
import type { Valuation } from "./stockSim.types.js";

/**
 * 재무 지표 계산.
 *
 * DART 사업보고서 값(연간) + 토스 발행주식수 + 현재가로 만든다.
 * - EPS: 배당사항의 주당순이익(지배기업 소유주 기준)을 우선 쓰고, 없으면 당기순이익 ÷ 발행주식수
 * - BPS: 자본총계 ÷ 발행주식수 (비지배지분 포함이라 증권사 BPS 보다 조금 클 수 있다)
 * - PER: 적자(EPS ≤ 0)면 의미가 없어 null
 */
export function computeValuation(fin: DartFinancials, price: number | null, shares: number | null): Valuation {
  const perShare = (v: number | null) => (v != null && shares ? v / shares : null);
  const ratio = (a: number | null, b: number | null) => (a != null && b != null && b !== 0 ? a / b : null);

  const eps = fin.eps ?? perShare(fin.netIncome);
  const bps = perShare(fin.totalEquity);

  return {
    basis: `${fin.bsnsYear} 사업보고서 (${fin.consolidated ? "연결" : "별도"})`,
    bsnsYear: fin.bsnsYear,
    consolidated: fin.consolidated,
    revenue: fin.revenue,
    operatingIncome: fin.operatingIncome,
    netIncome: fin.netIncome,
    totalEquity: fin.totalEquity,
    totalLiabilities: fin.totalLiabilities,
    eps,
    bps,
    per: price != null && eps != null && eps > 0 ? price / eps : null,
    pbr: price != null && bps != null && bps > 0 ? price / bps : null,
    roe: fin.totalEquity != null && fin.totalEquity > 0 ? ratio(fin.netIncome, fin.totalEquity) : null,
    operatingMargin: ratio(fin.operatingIncome, fin.revenue),
    debtRatio: fin.totalEquity != null && fin.totalEquity > 0 ? ratio(fin.totalLiabilities, fin.totalEquity) : null,
    dividendPerShare: fin.dividendPerShare,
    dividendYield: price != null && price > 0 && fin.dividendPerShare != null ? fin.dividendPerShare / price : null,
  };
}

export interface ValuationResult {
  valuation: Valuation | null;
  /** valuation 이 null 인 이유 */
  note: string | null;
}

/**
 * 종목의 재무 지표. 실패해도 예외를 던지지 않고 이유를 돌려준다 —
 * 재무 지표가 없다고 종목 화면·추천 전체가 실패하면 안 되기 때문이다.
 */
export async function getValuation(stock: TossStock, price: number | null): Promise<ValuationResult> {
  const dart = getDartClient();
  if (!dart) {
    return { valuation: null, note: "DART_API_KEY 가 설정되지 않아 재무 지표를 계산할 수 없습니다." };
  }
  if (stock.currency !== "KRW") {
    return { valuation: null, note: "해외 종목은 재무 지표를 제공하지 않습니다." };
  }

  try {
    const corpCode = await dart.getCorpCode(stock.symbol);
    if (!corpCode) {
      return { valuation: null, note: "DART 공시 대상이 아닌 종목입니다 (ETF·ETN·리츠 등)." };
    }

    const fin = await dart.getFinancials(corpCode);
    if (!fin) {
      return { valuation: null, note: "최근 사업보고서를 찾지 못했습니다." };
    }

    const shares = Number(stock.sharesOutstanding);
    return { valuation: computeValuation(fin, price, Number.isFinite(shares) && shares > 0 ? shares : null), note: null };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { valuation: null, note: `재무 지표를 불러오지 못했습니다: ${reason}` };
  }
}
