import { describe, it, expect } from "vitest";

import { formatJson, JsonParseError } from "./jsonPrettier.service.js";

/**
 * 기존 `JsonFormatServiceTest.java` 의 케이스를 그대로 이식한 순수 단위 테스트.
 */
describe("formatJson", () => {
  it("returns empty string for null input", () => {
    expect(formatJson(null, "prettify", 2, false, false)).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(formatJson("", "prettify", 2, false, false)).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(formatJson("   ", "prettify", 2, false, false)).toBe("");
  });

  it("prettifies with 2 spaces", () => {
    const result = formatJson('{"b":1,"a":2}', "prettify", 2, false, false);

    expect(result).toContain('  "b"');
    expect(result).toContain('  "a"');
  });

  it("prettifies with 4 spaces", () => {
    const result = formatJson('{"b":1}', "prettify", 4, false, false);

    expect(result).toContain('    "b"');
  });

  it("minifies by removing whitespace", () => {
    const input = '{\n  "a": 1,\n  "b": 2\n}';

    expect(formatJson(input, "minify", 2, false, false)).toBe(
      '{"a":1,"b":2}'
    );
  });

  it("sorts keys alphabetically", () => {
    const result = formatJson('{"c":3,"a":1,"b":2}', "minify", 2, true, false);

    expect(result.indexOf('"a"')).toBeLessThan(result.indexOf('"b"'));
    expect(result.indexOf('"b"')).toBeLessThan(result.indexOf('"c"'));
  });

  it("escapes non-ascii characters when ensureAscii is set", () => {
    const result = formatJson('{"key":"한글"}', "minify", 2, false, true);

    expect(result).not.toContain("한글");
    expect(result).toContain("\\u");
  });

  it("throws on invalid json", () => {
    expect(() => formatJson("{invalid}", "prettify", 2, false, false)).toThrow(
      JsonParseError
    );
  });

  it("sorts nested object keys recursively", () => {
    const result = formatJson(
      '{"z":1,"nested":{"c":3,"a":1}}',
      "prettify",
      2,
      true,
      false
    );

    expect(result.indexOf('"nested"')).toBeLessThan(result.indexOf('"z"'));

    const afterNested = result.slice(result.indexOf('"nested"'));
    expect(afterNested.indexOf('"a"')).toBeLessThan(afterNested.indexOf('"c"'));
  });

  it("preserves array elements and their order", () => {
    expect(formatJson("[1,2,3]", "minify", 2, false, false)).toBe("[1,2,3]");
    expect(formatJson('["c","a","b"]', "minify", 2, true, false)).toBe(
      '["c","a","b"]'
    );
  });

  // --- 아래는 기존 Java 구현이 암묵적으로 보장하던 동작에 대한 추가 회귀 테스트 ---

  it("reports 1-based line and column on parse failure", () => {
    try {
      formatJson('{\n  "a": 1,\n  "b" 2\n}', "prettify", 2, false, false);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(JsonParseError);
      const err = e as JsonParseError;
      expect(err.line).toBe(3);
      expect(err.column).toBeGreaterThan(1);
    }
  });

  it("ignores indent when minifying", () => {
    expect(formatJson('{"a":1}', "minify", 4, false, false)).toBe('{"a":1}');
  });
});
