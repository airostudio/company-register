import { describe, expect, it } from "vitest";
import { signatureMatches } from "./service";

describe("signatureMatches", () => {
  it("accepts the legal name regardless of case, spacing, accents and punctuation", () => {
    expect(signatureMatches("jane citizen", "Jane Citizen")).toBe(true);
    expect(signatureMatches("  JANE   CITIZEN ", "Jane Citizen")).toBe(true);
    expect(signatureMatches("Zoe O'Brien", "Zoë O’Brien")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(signatureMatches("Jane", "Jane Citizen")).toBe(false);
    expect(signatureMatches("Jane Citizens", "Jane Citizen")).toBe(false);
    expect(signatureMatches("", "Jane Citizen")).toBe(false);
    expect(signatureMatches("...", "Jane Citizen")).toBe(false);
  });
});
