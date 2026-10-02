import { describe, expect, it } from "vitest";
import { addresses, buildApplication, officer } from "@/test/fixtures";
import {
  createDetailsStepSchema,
  createNameStepSchema,
  createPeopleStepSchema,
  parseFormationApplication,
  summarizeOwnership,
} from "./formation";

const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.message);

describe("parseFormationApplication", () => {
  it.each([
    ["AU", "AU_PTY_LTD"],
    ["US_DE", "US_LLC"],
    ["US_DE", "US_C_CORP"],
    ["US_WY", "US_LLC"],
    ["UK", "UK_LTD"],
  ] as const)("accepts a complete %s %s application", (j, e) => {
    const result = parseFormationApplication(buildApplication(j, e));
    expect(result.success ? [] : result.issues).toEqual([]);
  });

  it("reports issues with section-prefixed paths", () => {
    const app = buildApplication("AU", "AU_PTY_LTD");
    app.review.acceptTerms = false;
    const result = parseFormationApplication(app);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues).toContainEqual({ path: "review.acceptTerms", message: "You must accept the terms of service" });
  });

  it("rejects entity types not offered in the jurisdiction", () => {
    const app = buildApplication("AU", "AU_PTY_LTD");
    const result = parseFormationApplication({ ...app, entity: { jurisdiction: "UK", entityType: "US_LLC" } });
    expect(result.success).toBe(false);
  });
});

describe("name step", () => {
  const schema = createNameStepSchema("AU", "AU_PTY_LTD");

  it("requires a matching, successful availability check", () => {
    expect(messages(schema.safeParse({ baseName: "Acme", suffix: "Pty Ltd", availability: null }))).toContain(
      "Check that this name is available before continuing",
    );
    expect(
      messages(
        schema.safeParse({
          baseName: "Acme Two",
          suffix: "Pty Ltd",
          availability: { checkedName: "Acme Pty Ltd", available: true, checkedAt: "" },
        }),
      ),
    ).toContain("Check that this name is available before continuing");
  });

  it("rejects legal endings typed into the base name and foreign suffixes", () => {
    expect(messages(schema.safeParse({ baseName: "Acme Pty Ltd", suffix: "Pty Ltd" }))[0]).toMatch(/Leave out "Pty Ltd"/);
    expect(messages(schema.safeParse({ baseName: "Acme", suffix: "LLC" }))).toContain("Choose a legal ending for a Pty Ltd");
  });
});

describe("details step", () => {
  it("requires Delaware registered office unless the registered agent is used", () => {
    const schema = createDetailsStepSchema("US_DE");
    const base = { principalSameAsRegistered: true, businessActivity: "Software consulting services", sicCodes: [] };
    expect(messages(schema.safeParse({ ...base, useAddressService: false, registeredAddress: addresses.austin }))).toContain(
      "Your own registered office must be in Delaware. Otherwise, use our registered agent.",
    );
    // With a registered agent, the registered office is ours but a principal office is required.
    expect(
      messages(schema.safeParse({ ...base, useAddressService: true, principalSameAsRegistered: false, principalAddress: addresses.berlin })),
    ).toEqual([]);
  });

  it("rejects PO boxes for an Australian registered office", () => {
    const schema = createDetailsStepSchema("AU");
    const r = schema.safeParse({
      useAddressService: false,
      registeredAddress: { ...addresses.sydney, line1: "PO Box 123" },
      principalSameAsRegistered: true,
      businessActivity: "Coffee roasting and wholesale",
      sicCodes: [],
    });
    expect(messages(r)[0]).toMatch(/PO boxes/);
  });

  it("requires SIC codes in the UK", () => {
    const r = createDetailsStepSchema("UK").safeParse({
      useAddressService: true,
      principalSameAsRegistered: true,
      businessActivity: "Software development",
      sicCodes: [],
    });
    expect(messages(r)).toContain("Choose at least one SIC code describing the business");
  });
});

describe("people step", () => {
  const today = new Date("2026-09-24T00:00:00Z");

  it("requires an Australian-resident director for a Pty Ltd", () => {
    const app = buildApplication("AU", "AU_PTY_LTD");
    app.people.officers = [officer({ roles: ["DIRECTOR"], residentialAddress: addresses.london })];
    expect(messages(createPeopleStepSchema("AU", "AU_PTY_LTD", { today }).safeParse(app.people))).toContain(
      "At least one director must ordinarily reside in Australia",
    );
  });

  it("validates Director ID, place of birth and minimum age", () => {
    const app = buildApplication("AU", "AU_PTY_LTD");
    app.people.officers = [officer({ roles: ["DIRECTOR"], directorId: "123", placeOfBirth: "", dateOfBirth: "2010-01-01" })];
    const m = messages(createPeopleStepSchema("AU", "AU_PTY_LTD", { today }).safeParse(app.people));
    expect(m).toEqual(
      expect.arrayContaining([
        "Enter the 15-digit Director ID",
        "Place of birth (town and country) is required for directors",
        "Directors must be at least 18 years old",
      ]),
    );
  });

  it("requires President and Secretary for a C-Corp", () => {
    const app = buildApplication("US_DE", "US_C_CORP");
    app.people.officers = [officer({ roles: ["DIRECTOR"], residentialAddress: addresses.austin })];
    const m = messages(createPeopleStepSchema("US_DE", "US_C_CORP", { today }).safeParse(app.people));
    expect(m).toEqual(expect.arrayContaining(["Appoint a President / CEO.", expect.stringMatching(/Appoint a Secretary/)]));
  });

  it("requires ownership to total exactly 100%", () => {
    const app = buildApplication("AU", "AU_PTY_LTD");
    app.people.shareholders[1]!.units = 10; // 50 + 10 of 100
    const m = messages(createPeopleStepSchema("AU", "AU_PTY_LTD", { today }).safeParse(app.people));
    expect(m).toContain("Allocated shares (60 of 100, 60%) must total 100%");
  });

  it("requires LLC membership interests to total 100%", () => {
    const app = buildApplication("US_WY", "US_LLC");
    app.people.shareholders[0]!.units = 70;
    const m = messages(createPeopleStepSchema("US_WY", "US_LLC", { today }).safeParse(app.people));
    expect(m).toContain("Membership interests add up to 120% — they must total exactly 100%");
  });

  it("requires significant individual shareholders to be declared as PSCs", () => {
    const app = buildApplication("UK", "UK_LTD");
    app.people.beneficialOwners = app.people.beneficialOwners.slice(0, 1);
    const m = messages(createPeopleStepSchema("UK", "UK_LTD", { today }).safeParse(app.people));
    expect(m).toContain("Sam Partner (50%) must be declared as a PSC");
  });

  it("allows a no-PSC statement only when nobody meets the threshold", () => {
    const app = buildApplication("UK", "UK_LTD");
    app.people.beneficialOwners = [];
    app.people.noBeneficialOwners = true;
    const m = messages(createPeopleStepSchema("UK", "UK_LTD", { today }).safeParse(app.people));
    expect(m).toContain("You can't make this statement when someone holds more than 25%");
  });

  it("uses 'more than 25%' for UK PSCs but '25% or more' elsewhere", () => {
    const uk = buildApplication("UK", "UK_LTD");
    uk.people.shareholders[0]!.units = 75;
    uk.people.shareholders[1]!.units = 25; // exactly 25% is not a PSC
    uk.people.beneficialOwners = uk.people.beneficialOwners.slice(0, 1);
    expect(messages(createPeopleStepSchema("UK", "UK_LTD", { today }).safeParse(uk.people))).toEqual([]);

    const us = buildApplication("US_DE", "US_C_CORP");
    us.people.shareholders[0]!.units = 7_500_000;
    us.people.shareholders[1]!.units = 2_500_000; // exactly 25% is a beneficial owner
    us.people.beneficialOwners = us.people.beneficialOwners.slice(0, 1);
    expect(messages(createPeopleStepSchema("US_DE", "US_C_CORP", { today }).safeParse(us.people))).toContain("Sam Partner (25%) must be declared as a beneficial owner");
  });
});

describe("summarizeOwnership", () => {
  it("computes live percentages and completeness", () => {
    const s = summarizeOwnership(
      [
        { id: "a", fullName: "A", units: 600, holderType: "INDIVIDUAL" },
        { id: "b", fullName: "B", units: 150, holderType: "CORPORATE" },
      ],
      1000,
    );
    expect(s).toMatchObject({ allocated: 750, remaining: 250, percentAllocated: 75, isComplete: false });
    expect(s.holders.map((h) => h.percent)).toEqual([60, 15]);
  });

  it("tolerates NaN input from empty number fields", () => {
    const s = summarizeOwnership([{ id: "a", fullName: "A", units: NaN, holderType: "INDIVIDUAL" }], NaN);
    expect(s).toMatchObject({ allocated: 0, totalUnits: 0, isComplete: false });
  });
});
