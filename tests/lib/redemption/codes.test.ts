import { describe, expect, it } from "vitest";
import {
  ALPHABET,
  CODE_LENGTH,
  formatCode,
  formatVisualCode,
  normalizeCode,
} from "@/lib/redemption/code-utils";
import { generateCode } from "@/lib/redemption/code-generator";

describe("redemption codes - generateCode", () => {
  it("returns a 12-char uppercase string from the safe alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode();
      expect(code).toHaveLength(CODE_LENGTH);
      // 全部字符必须在白名单
      for (const ch of code) {
        expect(ALPHABET).toContain(ch);
      }
      // 严禁出现易混淆字符 0/O/1/I/L
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it("produces high-entropy unique values (no collision in 5k samples)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5_000; i++) {
      const c = generateCode();
      expect(seen.has(c)).toBe(false);
      seen.add(c);
    }
    expect(seen.size).toBe(5_000);
  });
});

describe("redemption codes - normalizeCode", () => {
  it("strips dashes, spaces, and lowercases input then uppercases output", () => {
    expect(normalizeCode("abcd-efgh-jkmn")).toBe("ABCDEFGHJKMN");
    expect(normalizeCode("  ABCD efgh-JKMN  ")).toBe("ABCDEFGHJKMN");
    expect(normalizeCode("AB-CD_EF.GH=JK!MN")).toBe("ABCDEFGHJKMN");
  });

  it("returns empty string for falsy input", () => {
    expect(normalizeCode("")).toBe("");
    // @ts-expect-error null tolerance
    expect(normalizeCode(null)).toBe("");
    // @ts-expect-error undefined tolerance
    expect(normalizeCode(undefined)).toBe("");
  });
});

describe("redemption codes - formatCode", () => {
  it("inserts dashes every 4 chars when length is 12", () => {
    expect(formatCode("ABCDEFGHJKMN")).toBe("ABCD-EFGH-JKMN");
  });

  it("returns input unchanged when length != 12", () => {
    expect(formatCode("ABCD")).toBe("ABCD");
    expect(formatCode("")).toBe("");
  });
});

describe("redemption codes - formatVisualCode (input live-format)", () => {
  it("inserts dashes incrementally and caps at 12 chars", () => {
    expect(formatVisualCode("abcd")).toBe("ABCD");
    expect(formatVisualCode("abcdefgh")).toBe("ABCD-EFGH");
    expect(formatVisualCode("abcdefghjkmn")).toBe("ABCD-EFGH-JKMN");
    // 超长截断
    expect(formatVisualCode("abcdefghjkmnEXTRA")).toBe("ABCD-EFGH-JKMN");
  });

  it("ignores non-alphanumeric and produces dashed groups", () => {
    expect(formatVisualCode("ab-cd ef!gh")).toBe("ABCD-EFGH");
  });
});
