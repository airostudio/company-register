import { beforeEach, describe, expect, it } from "vitest";
import { buildApplication } from "@/test/fixtures";
import { formatAcn, isValidAcn, isValidAuPostcode, MockAsicAdapter } from "./mock/asic";
import { MockCompaniesHouseAdapter, ukPostcodeRegion } from "./mock/companies-house";
import { resetMockRegistry } from "./mock/simulator";
import { MockUsSecretaryOfStateAdapter } from "./mock/us-sos";
import { buildFormationPayload } from "./payload";
import { checkNameAcrossJurisdictions, getRegistryAdapter, getRegistryAdapterForReference } from "./index";
import { RegistryError } from "./types";

function clock(start = Date.UTC(2026, 8, 24, 0, 0, 0)) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

beforeEach(() => resetMockRegistry());

describe("name availability", () => {
  const asic = new MockAsicAdapter({ speed: 0 });

  it("flags identical names after normalising suffix, case and punctuation", async () => {
    const r = await asic.checkNameAvailability("ACME PROPRIETARY LIMITED", "AU");
    expect(r.status).toBe("UNAVAILABLE");
    expect(r.issues[0]).toMatchObject({ code: "IDENTICAL_NAME" });
    expect(r.suggestions.length).toBeGreaterThan(0);
    for (const s of r.suggestions) {
      expect((await asic.checkNameAvailability(s, "AU")).available).toBe(true);
    }
  });

  it("warns about similar names and restricted words without blocking", async () => {
    const similar = await asic.checkNameAvailability("Atlasian Pty Ltd", "AU");
    expect(similar.available).toBe(true);
    expect(similar.issues.map((i) => i.code)).toContain("SIMILAR_NAME");

    const bank = await asic.checkNameAvailability("Outback Bank Pty Ltd", "AU");
    expect(bank.available).toBe(true);
    expect(bank.issues.map((i) => i.code)).toContain("RESTRICTED_WORD");
  });

  it("marks invalid characters as INVALID", async () => {
    const r = await asic.checkNameAvailability("Acme <script> Pty Ltd", "AU");
    expect(r.status).toBe("INVALID");
  });

  it("checks one name across several registries with each default suffix", async () => {
    process.env.MOCK_REGISTRY_SPEED = "0";
    const results = await checkNameAcrossJurisdictions("Acme", [
      { jurisdiction: "AU" },
      { jurisdiction: "US_DE", entityType: "US_LLC" },
      { jurisdiction: "UK" },
    ]);
    expect(results.map((r) => [r.jurisdiction, r.result?.query, r.result?.available])).toEqual([
      ["AU", "Acme Pty Ltd", false],
      ["US_DE", "Acme LLC", false],
      ["UK", "Acme Ltd", true],
    ]);
  });
});

describe("filing lifecycle", () => {
  it("moves SUBMITTED → UNDER_REVIEW → APPROVED and issues a valid ACN", async () => {
    const c = clock();
    const asic = new MockAsicAdapter({ now: c.now, speed: 0.001 });
    const payload = buildFormationPayload(buildApplication("AU", "AU_PTY_LTD"), "filing_1");

    const receipt = await asic.submitFiling(payload);
    expect(receipt.filingId).toMatch(/^ASIC-AU-/);
    expect((await asic.pollFilingStatus(receipt.filingId)).status).toBe("SUBMITTED");

    c.advance(6_000 * 0.001);
    expect((await asic.pollFilingStatus(receipt.filingId)).status).toBe("UNDER_REVIEW");

    c.advance(20_000 * 0.001);
    const approved = await asic.pollFilingStatus(receipt.filingId);
    expect(approved.status).toBe("APPROVED");
    expect(isValidAcn(approved.registration!.registryNumber)).toBe(true);
    expect(approved.registration!.legalName).toBe("Harbourview Robotics Pty Ltd");

    const docs = await asic.downloadOfficialDocuments(receipt.filingId);
    expect(docs.map((d) => d.type)).toEqual(["CERTIFICATE_OF_INCORPORATION", "REGISTRY_FILING"]);
    expect(Buffer.from(docs[0]!.content.slice(0, 5)).toString()).toBe("%PDF-");

    // The lodged name is now taken.
    expect((await asic.checkNameAvailability("Harbourview Robotics Pty Ltd", "AU")).available).toBe(false);
  });

  it("refuses documents before approval", async () => {
    const asic = new MockAsicAdapter({ speed: 1 });
    const receipt = await asic.submitFiling(buildFormationPayload(buildApplication("AU", "AU_PTY_LTD"), "f"));
    await expect(asic.downloadOfficialDocuments(receipt.filingId)).rejects.toMatchObject({ code: "NOT_READY" });
  });

  it("simulates examiner requisitions and rejections from magic names", async () => {
    const c = clock();
    const us = new MockUsSecretaryOfStateAdapter({ now: c.now, speed: 0 });
    const req = await us.submitFiling(buildFormationPayload(buildApplication("US_DE", "US_LLC", "Requisition Test"), "r1"));
    const rej = await us.submitFiling(buildFormationPayload(buildApplication("US_WY", "US_LLC", "Reject Me"), "r2"));
    c.advance(1);
    expect(await us.pollFilingStatus(req.filingId)).toMatchObject({ status: "REQUIRES_ACTION", issues: [{ code: "REQUISITION" }] });
    expect(await us.pollFilingStatus(rej.filingId)).toMatchObject({ status: "REJECTED", issues: [{ code: "NAME_CONFLICT" }] });
  });

  it("formats Wyoming and Delaware registry numbers differently", async () => {
    const c = clock();
    const us = new MockUsSecretaryOfStateAdapter({ now: c.now, speed: 0 });
    const de = await us.submitFiling(buildFormationPayload(buildApplication("US_DE", "US_C_CORP"), "de"));
    const wy = await us.submitFiling(buildFormationPayload(buildApplication("US_WY", "US_LLC", "Prairie Goods"), "wy"));
    c.advance(1);
    expect((await us.pollFilingStatus(de.filingId)).registration!.registryNumber).toMatch(/^\d{7}$/);
    expect((await us.pollFilingStatus(wy.filingId)).registration!.registryNumber).toMatch(/^2026-\d{9}$/);
  });

  it("finishes expedited filings sooner", async () => {
    const c = clock();
    const us = new MockUsSecretaryOfStateAdapter({ now: c.now });
    const app = buildApplication("US_DE", "US_LLC");
    app.addons.addOns = ["EXPEDITED"];
    const receipt = await us.submitFiling(buildFormationPayload(app, "x"));
    c.advance(30_000 * 0.3);
    expect((await us.pollFilingStatus(receipt.filingId)).status).toBe("APPROVED");
  }, 10_000);

  it("rejects unknown references", async () => {
    await expect(new MockAsicAdapter().pollFilingStatus("ASIC-AU-zzz")).rejects.toBeInstanceOf(RegistryError);
    await expect(new MockAsicAdapter().pollFilingStatus("US-SOS-US_DE-abc-as-1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("mock government errors", () => {
  it("rejects a name that is already registered", async () => {
    const asic = new MockAsicAdapter({ speed: 0 });
    const payload = buildFormationPayload(buildApplication("AU", "AU_PTY_LTD", "Canva"), "c");
    await expect(asic.submitFiling(payload)).rejects.toMatchObject({ code: "NAME_CONFLICT", issues: [{ field: "companyName" }] });
  });

  it("rejects an Australian postcode that doesn't match the state", async () => {
    const app = buildApplication("AU", "AU_PTY_LTD");
    app.details.registeredAddress = { ...app.details.registeredAddress!, region: "NSW", postcode: "3000" };
    const err = await new MockAsicAdapter({ speed: 0 }).submitFiling(buildFormationPayload(app, "p")).catch((e) => e);
    expect(err).toBeInstanceOf(RegistryError);
    expect(err.code).toBe("INVALID_POSTAL_CODE");
    expect(err.issues[0].field).toBe("registeredOffice.postcode");
  });

  it("rejects a Delaware ZIP outside the state and a Scottish postcode filed as England", async () => {
    const de = buildApplication("US_DE", "US_LLC");
    de.details.registeredAddress = { ...de.details.registeredAddress!, postcode: "90210" };
    await expect(new MockUsSecretaryOfStateAdapter({ speed: 0 }).submitFiling(buildFormationPayload(de, "z"))).rejects.toMatchObject({
      code: "INVALID_POSTAL_CODE",
    });

    const uk = buildApplication("UK", "UK_LTD");
    uk.details.registeredAddress = { ...uk.details.registeredAddress!, postcode: "EH1 1YZ" };
    await expect(new MockCompaniesHouseAdapter({ speed: 0 }).submitFiling(buildFormationPayload(uk, "s"))).rejects.toMatchObject({
      code: "INVALID_POSTAL_CODE",
    });
  });

  it("surfaces transient gateway outages as retryable errors", async () => {
    const ch = new MockCompaniesHouseAdapter({ speed: 0, failureRate: 1 });
    const err = await ch.submitFiling(buildFormationPayload(buildApplication("UK", "UK_LTD"), "t")).catch((e) => e);
    expect(err).toMatchObject({ code: "SERVICE_UNAVAILABLE", retryable: true });
  });
});

describe("helpers", () => {
  it("formats ACNs with a valid check digit", () => {
    expect(isValidAcn("000 000 019")).toBe(true);
    expect(isValidAcn("000 000 018")).toBe(false);
    for (const seed of [1, 42, 123_456, 99_999_999]) expect(isValidAcn(formatAcn(seed))).toBe(true);
  });

  it("validates AU postcodes by state and UK postcodes by region", () => {
    expect(isValidAuPostcode("VIC", "3000")).toBe(true);
    expect(isValidAuPostcode("NSW", "3000")).toBe(false);
    expect(isValidAuPostcode("ACT", "2600")).toBe(true);
    expect(ukPostcodeRegion("EH1 1YZ")).toBe("SCT");
    expect(ukPostcodeRegion("BT1 5GS")).toBe("NIR");
    expect(ukPostcodeRegion("SW1A 2AA")).toBe("ENG_WLS");
  });

  it("routes jurisdictions and references to the right adapter", () => {
    expect(getRegistryAdapter("US_WY").registryCode).toBe("US-SOS");
    expect(getRegistryAdapter("UK").registryCode).toBe("CH");
    expect(getRegistryAdapterForReference("US-SOS-US_DE-abc-as-1").registryCode).toBe("US-SOS");
  });
});

describe("jurisdiction scoping", () => {
  it("treats Delaware and Wyoming as separate registers", async () => {
    const us = new MockUsSecretaryOfStateAdapter({ speed: 0 });
    await us.submitFiling(buildFormationPayload(buildApplication("US_DE", "US_LLC", "Twin Peaks"), "de-1"));
    expect((await us.checkNameAvailability("Twin Peaks LLC", "US_DE")).available).toBe(false);
    expect((await us.checkNameAvailability("Twin Peaks LLC", "US_WY")).available).toBe(true);
  });
});
