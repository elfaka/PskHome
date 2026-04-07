import { describe, it, expect } from "vitest";
import { formatJson } from "./jsonPrettierApi";

describe("formatJson API function", () => {
  it("returns ok:true with formatted output on valid input", async () => {
    const result = await formatJson({ input: '{"a":1}', mode: "prettify" });
    expect(result.ok).toBe(true);
    expect(result.formatted).toBeDefined();
    expect(result.stats).toBeDefined();
  });

  it("returns correct mode in response", async () => {
    const result = await formatJson({ input: '{"a":1}', mode: "prettify" });
    expect(result.mode).toBe("prettify");
  });

  it("returns stats with inputLength and outputLength", async () => {
    const result = await formatJson({ input: '{"a":1}', mode: "prettify" });
    expect(result.stats).toHaveProperty("inputLength");
    expect(result.stats).toHaveProperty("outputLength");
  });
});
