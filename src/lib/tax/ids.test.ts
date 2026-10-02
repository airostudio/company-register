import { describe, expect, it } from "vitest";
import { abnFromAcn, einFromSeed, isValidAbn, isValidEin, utrFromSeed, isValidUtr } from "./ids";

describe("tax identifiers", () => {
  it("validates real-format ABNs", () => {
    expect(isValidAbn("51 824 753 556")).toBe(true); // ATO's published example
    expect(isValidAbn("51 824 753 557")).toBe(false);
    expect(isValidAbn("1234")).toBe(false);
  });

  it("derives a valid ABN that ends with the company's ACN", () => {
    const abn = abnFromAcn("000 000 019");
    expect(isValidAbn(abn)).toBe(true);
    expect(abn.replace(/\s/g, "").endsWith("000000019")).toBe(true);
    expect(isValidAbn(abnFromAcn("600 000 002"))).toBe(true);
  });

  it("issues EINs with assigned campus prefixes", () => {
    for (const seed of [0, 7, 123_456_789, 2 ** 31]) expect(isValidEin(einFromSeed(seed))).toBe(true);
    expect(isValidEin("00-1234567")).toBe(false);
    expect(isValidEin("88-1234567")).toBe(true);
  });

  it("issues 10-digit UTRs", () => {
    expect(isValidUtr(utrFromSeed(42))).toBe(true);
  });
});
