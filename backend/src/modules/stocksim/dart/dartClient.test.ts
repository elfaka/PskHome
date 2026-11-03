import { deflateRawSync } from "node:zlib";
import { describe, it, expect } from "vitest";

import { computeValuation, financialHistory } from "../valuation.js";
import {
  createDartClient,
  parseCorpCodes,
  parseDartNumber,
  parseFinancials,
  unzipSingleFile,
} from "./dartClient.js";

/**
 * DART 응답은 실제 삼성전자 2025 사업보고서 응답(fnlttSinglAcnt / alotMatter)에서 필요한 행만 옮겼다.
 */
/** 당기·전기·전전기 (2025·2024·2023) */
const cfs = (account_nm: string, thstrm: string, frmtrm: string, bfefrmtrm: string) => ({
  fs_div: "CFS",
  account_nm,
  thstrm_amount: thstrm,
  frmtrm_amount: frmtrm,
  bfefrmtrm_amount: bfefrmtrm,
});

const ACCOUNTS = [
  cfs("자산총계", "566,942,110,000,000", "514,531,948,000,000", "455,905,980,000,000"),
  cfs("자본총계", "436,320,337,000,000", "402,192,070,000,000", "363,677,865,000,000"),
  cfs("부채총계", "130,621,773,000,000", "112,339,878,000,000", "92,228,115,000,000"),
  cfs("매출액", "333,605,938,000,000", "300,870,903,000,000", "258,935,494,000,000"),
  cfs("영업이익", "43,601,051,000,000", "32,725,961,000,000", "6,566,976,000,000"),
  cfs("당기순이익(손실)", "45,206,805,000,000", "34,451,351,000,000", "15,487,100,000,000"),
  { fs_div: "OFS", account_nm: "자본총계", thstrm_amount: "254,330,083,000,000" },
  { fs_div: "OFS", account_nm: "당기순이익(손실)", thstrm_amount: "33,686,601,000,000" },
];

const DIVIDENDS = [
  { se: "(연결)주당순이익(원)", stock_knd: "-", thstrm: "6,605", frmtrm: "4,950", lwfr: "2,131" },
  { se: "(별도)주당순이익(원)", stock_knd: "-", thstrm: "4,958" },
  { se: "주당 현금배당금(원)", stock_knd: "보통주", thstrm: "1,668", frmtrm: "1,446", lwfr: "1,444" },
  { se: "주당 현금배당금(원)", stock_knd: "우선주", thstrm: "1,669", frmtrm: "1,447", lwfr: "1,445" },
];

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<result>
    <list>
        <corp_code>00434003</corp_code>
        <corp_name>다코</corp_name>
        <corp_eng_name>Daco corporation</corp_eng_name>
        <stock_code> </stock_code>
        <modify_date>20170630</modify_date>
    </list>
    <list>
        <corp_code>00126380</corp_code>
        <corp_name>삼성전자</corp_name>
        <corp_eng_name>SAMSUNG ELECTRONICS CO,.LTD</corp_eng_name>
        <stock_code>005930</stock_code>
        <modify_date>20251201</modify_date>
    </list>
</result>`;

/** DART 처럼 data descriptor(로컬 헤더 크기 0)를 쓰는 단일 파일 zip */
function zipOf(name: string, content: string): Buffer {
  const data = deflateRawSync(Buffer.from(content, "utf8"));
  const fileName = Buffer.from(name);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 6); // flags: data descriptor
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(fileName.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(Buffer.byteLength(content), 24);
  central.writeUInt16LE(fileName.length, 28);
  central.writeUInt32LE(0, 42);

  const centralOffset = local.length + fileName.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + fileName.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([local, fileName, data, central, fileName, eocd]);
}

describe("DART parsing", () => {
  it("parses comma numbers and dashes", () => {
    expect(parseDartNumber("1,234")).toBe(1234);
    expect(parseDartNumber("-1,000")).toBe(-1000);
    expect(parseDartNumber("-")).toBeNull();
    expect(parseDartNumber(undefined)).toBeNull();
  });

  it("unzips corpCode.xml and keeps listed companies only", () => {
    const map = parseCorpCodes(unzipSingleFile(zipOf("CORPCODE.xml", XML)));

    expect(map.get("005930")).toBe("00126380");
    expect(map.size).toBe(1);
  });

  it("prefers consolidated statements and the controlling-interest EPS", () => {
    const fin = parseFinancials(2025, ACCOUNTS, DIVIDENDS);

    expect(fin).toMatchObject({
      bsnsYear: 2025,
      consolidated: true,
      revenue: 333_605_938_000_000,
      operatingIncome: 43_601_051_000_000,
      netIncome: 45_206_805_000_000,
      totalEquity: 436_320_337_000_000,
      totalLiabilities: 130_621_773_000_000,
      eps: 6605,
      dividendPerShare: 1668,
    });
  });

  it("reads the prior two years from the same report, oldest first", () => {
    const { history } = parseFinancials(2025, ACCOUNTS, DIVIDENDS);

    expect(history.map((y) => y.year)).toEqual([2023, 2024, 2025]);
    expect(history[0]).toEqual({
      year: 2023,
      revenue: 258_935_494_000_000,
      operatingIncome: 6_566_976_000_000,
      netIncome: 15_487_100_000_000,
      totalAssets: 455_905_980_000_000,
      totalLiabilities: 92_228_115_000_000,
      totalEquity: 363_677_865_000_000,
      eps: 2131,
      dividendPerShare: 1444,
    });
    expect(history[1]).toMatchObject({ year: 2024, revenue: 300_870_903_000_000, eps: 4950, dividendPerShare: 1446 });
    expect(history[2]).toMatchObject({ year: 2025, totalAssets: 566_942_110_000_000, eps: 6605 });
  });

  it("drops years the report has no figures for (newly listed companies)", () => {
    const onlyCurrent = ACCOUNTS.map(({ frmtrm_amount: _f, bfefrmtrm_amount: _b, ...rest }) => rest);
    const { history } = parseFinancials(2025, onlyCurrent, null);

    expect(history.map((y) => y.year)).toEqual([2025]);
  });

  it("falls back to separate statements", () => {
    const fin = parseFinancials(2025, ACCOUNTS.filter((r) => r.fs_div === "OFS"), DIVIDENDS);

    expect(fin.consolidated).toBe(false);
    expect(fin.totalEquity).toBe(254_330_083_000_000);
    expect(fin.eps).toBe(4958);
  });
});

describe("computeValuation", () => {
  it("derives PER, PBR, ROE and dividend yield", () => {
    const fin = parseFinancials(2025, ACCOUNTS, DIVIDENDS);
    const v = computeValuation(fin, 66_050, 5_919_637_922);

    expect(v.basis).toBe("2025 사업보고서 (연결)");
    expect(v.eps).toBe(6605);
    expect(v.per).toBeCloseTo(10);
    expect(v.bps).toBeCloseTo(436_320_337_000_000 / 5_919_637_922);
    expect(v.pbr).toBeCloseTo(66_050 / (436_320_337_000_000 / 5_919_637_922));
    expect(v.roe).toBeCloseTo(45_206_805 / 436_320_337);
    expect(v.dividendYield).toBeCloseTo(1668 / 66_050);
    expect(v.debtRatio).toBeCloseTo(130_621_773 / 436_320_337);
  });

  it("adds margins, ROE and year-over-year growth for each year", () => {
    const v = computeValuation(parseFinancials(2025, ACCOUNTS, DIVIDENDS), 66_050, 5_919_637_922);
    const [y2023, y2024, y2025] = v.history;

    expect(y2023.revenueGrowth).toBeNull(); // 전년 값이 없다
    expect(y2024.revenueGrowth).toBeCloseTo(300_870_903 / 258_935_494 - 1);
    expect(y2025.operatingIncomeGrowth).toBeCloseTo(43_601_051 / 32_725_961 - 1);
    expect(y2025.operatingMargin).toBeCloseTo(43_601_051 / 333_605_938);
    expect(y2025.netMargin).toBeCloseTo(45_206_805 / 333_605_938);
    expect(y2024.roe).toBeCloseTo(34_451_351 / 402_192_070);
    expect(y2023.debtRatio).toBeCloseTo(92_228_115 / 363_677_865);
  });

  it("measures growth against the absolute prior value and skips ratios on negative equity", () => {
    const year = (y: number, netIncome: number, totalEquity: number) => ({
      year: y,
      revenue: 100,
      operatingIncome: netIncome,
      netIncome,
      totalAssets: 100,
      totalLiabilities: 150,
      totalEquity,
      eps: null,
      dividendPerShare: null,
    });
    const [, turnaround] = financialHistory([year(2024, -50, 10), year(2025, 25, -5)]);

    // 적자 -50 → 흑자 25 는 +150%
    expect(turnaround.netIncomeGrowth).toBeCloseTo(1.5);
    expect(turnaround.roe).toBeNull();
    expect(turnaround.debtRatio).toBeNull();
  });

  it("leaves PER empty for a loss and computes EPS when the dividend section has none", () => {
    const v = computeValuation(
      { ...parseFinancials(2025, ACCOUNTS, null), netIncome: -100, eps: null },
      1000,
      10
    );

    expect(v.eps).toBe(-10);
    expect(v.per).toBeNull();
  });
});

describe("createDartClient", () => {
  function setup(responses: Record<string, unknown>) {
    const calls: string[] = [];
    const client = createDartClient({
      baseUrl: "https://dart.test/api",
      apiKey: "key",
      now: () => new Date("2026-10-30T00:00:00Z"),
      fetch: (async (input: string | URL | Request) => {
        const url = new URL(String(input));
        calls.push(`${url.pathname.split("/").pop()}?${url.searchParams.get("bsns_year") ?? ""}`);
        const key = `${url.pathname.split("/").pop()}:${url.searchParams.get("bsns_year") ?? ""}`;
        const body = responses[key];
        if (Buffer.isBuffer(body)) return new Response(new Uint8Array(body));
        return new Response(JSON.stringify(body ?? { status: "013", message: "조회된 데이타가 없습니다." }));
      }) as typeof fetch,
    });
    return { client, calls };
  }

  it("maps stock codes to corp codes once per day", async () => {
    const { client, calls } = setup({ "corpCode.xml:": zipOf("CORPCODE.xml", XML) });

    expect(await client.getCorpCode("005930")).toBe("00126380");
    expect(await client.getCorpCode("999999")).toBeNull();
    expect(calls.filter((c) => c.startsWith("corpCode"))).toHaveLength(1);
  });

  it("uses last year's annual report, falling back to the year before", async () => {
    const { client, calls } = setup({
      "fnlttSinglAcnt.json:2024": { status: "000", message: "정상", list: ACCOUNTS },
      "alotMatter.json:2024": { status: "000", message: "정상", list: DIVIDENDS },
    });

    const fin = await client.getFinancials("00126380");

    expect(fin?.bsnsYear).toBe(2024);
    expect(fin?.eps).toBe(6605);
    expect(calls).toEqual(["fnlttSinglAcnt.json?2025", "fnlttSinglAcnt.json?2024", "alotMatter.json?2024"]);
  });

  it("turns DART errors such as a wrong key into 503", async () => {
    const { client } = setup({
      "fnlttSinglAcnt.json:2025": { status: "010", message: "등록되지 않은 키입니다." },
    });

    await expect(client.getFinancials("00126380")).rejects.toMatchObject({ status: 503, code: "DART_ERROR" });
  });
});
