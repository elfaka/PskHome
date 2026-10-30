import { inflateRawSync } from "node:zlib";

import { env } from "../../../config/env.js";
import { HttpError } from "../../../lib/httpError.js";
import { TtlCache } from "../../../lib/ttlCache.js";

/**
 * OpenDART(금융감독원 전자공시) 클라이언트 — 재무 지표 계산에 필요한 값만 가져온다.
 *
 * 토스증권 Open API 에는 재무 데이터가 없어서 PER·EPS·PBR 등은 여기서 받은 사업보고서 값으로 계산한다.
 *
 * - `corpCode.xml`: 전체 회사의 고유번호(zip). 종목코드 → 고유번호 변환에 쓰고 하루 캐시한다.
 * - `fnlttSinglAcnt.json`: 단일회사 주요계정 (매출액·영업이익·당기순이익·자본총계·부채총계)
 * - `alotMatter.json`: 배당에 관한 사항 (주당순이익·주당 현금배당금)
 *
 * 하루 2만 건 한도가 있어 재무 데이터도 회사별로 하루 캐시한다 (사업보고서는 1년에 한 번 바뀐다).
 */

export interface DartFinancials {
  bsnsYear: number;
  /** 연결재무제표 기준이면 true, 별도면 false */
  consolidated: boolean;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  totalEquity: number | null;
  totalLiabilities: number | null;
  /** 배당사항의 주당순이익 (지배기업 소유주 기준) */
  eps: number | null;
  /** 보통주 주당 현금배당금 */
  dividendPerShare: number | null;
}

export interface DartClient {
  /** 상장 종목코드(6자리) → DART 고유번호. 공시 대상이 아니면 null (ETF 등) */
  getCorpCode(stockCode: string): Promise<string | null>;
  /** 가장 최근 사업보고서 기준 재무값. 보고서가 없으면 null */
  getFinancials(corpCode: string): Promise<DartFinancials | null>;
}

export interface DartClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

/** 사업보고서 */
const ANNUAL_REPORT = "11011";
const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 30_000;

/** DART 응답 status — 000 정상, 013 데이터 없음. 나머지(키 오류·한도 초과 등)는 장애로 본다. */
const STATUS_OK = "000";
const STATUS_NO_DATA = "013";

interface DartRow {
  [key: string]: string | undefined;
}

interface DartJson {
  status: string;
  message: string;
  list?: DartRow[];
}

const ACCOUNT_NAMES = {
  revenue: ["매출액", "수익(매출액)", "영업수익", "매출"],
  operatingIncome: ["영업이익", "영업이익(손실)"],
  netIncome: ["당기순이익", "당기순이익(손실)"],
  totalEquity: ["자본총계"],
  totalLiabilities: ["부채총계"],
} as const;

/** "1,234" → 1234, "-" / "" → null */
export function parseDartNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * corpCode.xml zip 에서 XML 을 꺼낸다. 파일이 하나뿐인 zip 이라 중앙 디렉터리만 읽으면 된다.
 * (DART zip 은 data descriptor 를 써서 로컬 헤더의 크기가 0 이다 → 크기는 중앙 디렉터리에서 읽는다)
 */
export function unzipSingleFile(zip: Buffer): string {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("zip 형식이 아닙니다.");

  const central = zip.readUInt32LE(eocd + 16);
  const method = zip.readUInt16LE(central + 10);
  const compressedSize = zip.readUInt32LE(central + 20);
  const localHeader = zip.readUInt32LE(central + 42);
  const dataStart = localHeader + 30 + zip.readUInt16LE(localHeader + 26) + zip.readUInt16LE(localHeader + 28);
  const data = zip.subarray(dataStart, dataStart + compressedSize);

  return (method === 0 ? data : inflateRawSync(data)).toString("utf8");
}

/** corpCode.xml → 종목코드 → 고유번호 (상장사만) */
export function parseCorpCodes(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const pattern = /<corp_code>(\d+)<\/corp_code>[\s\S]*?<stock_code>([^<]*)<\/stock_code>/g;

  for (const [, corpCode, stockCode] of xml.matchAll(pattern)) {
    const code = stockCode.trim();
    if (code) map.set(code, corpCode);
  }

  return map;
}

/** 주요계정 + 배당 응답을 재무값으로 바꾼다. 연결재무제표가 있으면 연결, 없으면 별도. */
export function parseFinancials(bsnsYear: number, accounts: DartRow[], dividends: DartRow[] | null): DartFinancials {
  const consolidated = accounts.some((r) => r.fs_div === "CFS");
  const rows = accounts.filter((r) => r.fs_div === (consolidated ? "CFS" : "OFS"));

  const pick = (names: readonly string[]) => {
    const row = rows.find((r) => names.includes((r.account_nm ?? "").trim()));
    return parseDartNumber(row?.thstrm_amount);
  };

  const dividendRow = (label: (se: string) => boolean, stockKind?: string) =>
    dividends?.find((r) => label((r.se ?? "").replace(/\s/g, "")) && (!stockKind || r.stock_knd === stockKind));

  const epsLabel = consolidated ? "(연결)주당순이익(원)" : "(별도)주당순이익(원)";
  const epsRow = dividendRow((se) => se === epsLabel) ?? dividendRow((se) => se.includes("주당순이익"));
  const dpsRow = dividendRow((se) => se === "주당현금배당금(원)", "보통주");

  return {
    bsnsYear,
    consolidated,
    revenue: pick(ACCOUNT_NAMES.revenue),
    operatingIncome: pick(ACCOUNT_NAMES.operatingIncome),
    netIncome: pick(ACCOUNT_NAMES.netIncome),
    totalEquity: pick(ACCOUNT_NAMES.totalEquity),
    totalLiabilities: pick(ACCOUNT_NAMES.totalLiabilities),
    eps: parseDartNumber(epsRow?.thstrm),
    dividendPerShare: parseDartNumber(dpsRow?.thstrm),
  };
}

export function createDartClient(options: DartClientOptions): DartClient {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  const corpCodes = new TtlCache<Map<string, string>>(DAY_MS);
  const financials = new TtlCache<DartFinancials | null>(DAY_MS);

  async function request(path: string, query: Record<string, string> = {}): Promise<Response> {
    const qs = new URLSearchParams({ crtfc_key: options.apiKey, ...query });
    try {
      return await doFetch(`${baseUrl}/${path}?${qs}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new HttpError(503, "DART_UNREACHABLE", `DART 에 연결하지 못했습니다: ${reason}`);
    }
  }

  /** 데이터가 없으면(013) null */
  async function list(path: string, query: Record<string, string>): Promise<DartRow[] | null> {
    const res = await request(path, query);
    const body = (await res.json()) as DartJson;

    if (body.status === STATUS_NO_DATA) return null;
    if (body.status !== STATUS_OK) {
      throw new HttpError(503, "DART_ERROR", `DART 오류 (${body.status}): ${body.message}`);
    }
    return body.list ?? [];
  }

  async function loadCorpCodes(): Promise<Map<string, string>> {
    const res = await request("corpCode.xml");
    const buf = Buffer.from(await res.arrayBuffer());

    // 키가 틀리면 zip 대신 오류 JSON/XML 이 온다.
    if (buf.readUInt32LE(0) !== 0x04034b50) {
      throw new HttpError(503, "DART_ERROR", `DART 고유번호 목록을 받지 못했습니다: ${buf.subarray(0, 200).toString("utf8")}`);
    }

    return parseCorpCodes(unzipSingleFile(buf));
  }

  async function loadFinancials(corpCode: string): Promise<DartFinancials | null> {
    // 사업보고서는 3월 말까지 나온다 → 작년 것이 없으면 재작년 것을 쓴다.
    const thisYear = Number(now().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 4));

    for (const year of [thisYear - 1, thisYear - 2]) {
      const query = { corp_code: corpCode, bsns_year: String(year), reprt_code: ANNUAL_REPORT };
      const accounts = await list("fnlttSinglAcnt.json", query);
      if (!accounts || accounts.length === 0) continue;

      const dividends = await list("alotMatter.json", query).catch(() => null);
      return parseFinancials(year, accounts, dividends);
    }

    return null;
  }

  return {
    async getCorpCode(stockCode) {
      return (await corpCodes.get("all", loadCorpCodes)).get(stockCode) ?? null;
    },
    getFinancials: (corpCode) => financials.get(corpCode, () => loadFinancials(corpCode)),
  };
}

let singleton: DartClient | null = null;

/** 키가 없으면 null — 재무 지표 없이 나머지 기능은 그대로 동작한다. */
export function getDartClient(): DartClient | null {
  if (!env.DART_API_KEY) return null;

  singleton ??= createDartClient({ baseUrl: env.DART_API_BASE_URL, apiKey: env.DART_API_KEY });
  return singleton;
}
