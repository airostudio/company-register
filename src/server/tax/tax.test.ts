import { describe, expect, it } from "vitest";
import { buildTaxApplication, type TaxApplicationInput } from "@/lib/tax/application";
import { isValidAbn, isValidEin, isValidUtr } from "@/lib/tax/ids";
import { addresses } from "@/test/fixtures";
import { MockTaxAdapter } from "./adapters";

function input(jurisdiction: TaxApplicationInput["jurisdiction"], entityType: TaxApplicationInput["entityType"], home = addresses.austin): TaxApplicationInput {
  return {
    jurisdiction,
    entityType,
    companyName: "Harbourview Robotics",
    registryNumber: jurisdiction === "AU" ? "650 000 017" : "16123456",
    incorporatedAt: new Date("2026-10-02T00:00:00Z"),
    address: addresses.wilmington,
    businessActivity: "Warehouse robots",
    sicCodes: ["62012"],
    officers: [{ fullName: "Jane Citizen", roles: ["MANAGER"], residentialAddress: home }],
    memberCount: 1,
  };
}

describe("buildTaxApplication", () => {
  it("prepares an SS-4 and flags foreign responsible parties", () => {
    const local = buildTaxApplication(input("US_DE", "US_LLC"));
    expect(local).toMatchObject({ authority: "IRS", foreignApplicant: false });
    expect(local.sections[0]!.fields).toContainEqual(["Type of entity (9a)", "LLC — 1 member(s) (disregarded entity unless an election is made)"]);
    const foreign = buildTaxApplication(input("US_WY", "US_LLC", addresses.berlin));
    expect(foreign.foreignApplicant).toBe(true);
    expect(foreign.sections[1]!.fields).toContainEqual(["SSN / ITIN", "None — foreign responsible party (file by fax/mail, write 'Foreign' on 7b)"]);
  });

  it("targets the ABR in Australia and HMRC in the UK", () => {
    expect(buildTaxApplication(input("AU", "AU_PTY_LTD", addresses.melbourne)).authority).toBe("ABR");
    expect(buildTaxApplication(input("UK", "UK_LTD", addresses.london)).authority).toBe("HMRC");
  });
});

describe("MockTaxAdapter", () => {
  it.each([
    ["US_DE", "US_LLC", isValidEin],
    ["AU", "AU_PTY_LTD", isValidAbn],
    ["UK", "UK_LTD", isValidUtr],
  ] as const)("issues a valid number for %s after the simulated delay", async (j, e, valid) => {
    let t = Date.UTC(2026, 9, 2);
    const adapter = new MockTaxAdapter(0.001, () => t);
    const app = buildTaxApplication(input(j, e));
    const { reference } = await adapter.submit(app, { filingId: "f1" });
    expect((await adapter.poll(reference, app)).status).toBe("PENDING");
    t += 1_000;
    const issued = await adapter.poll(reference, app);
    expect(issued.status).toBe("ISSUED");
    if (issued.status === "ISSUED") expect(valid(issued.taxId)).toBe(true);
  });

  it("derives the ABN from the company's ACN", async () => {
    let t = 0;
    const adapter = new MockTaxAdapter(0, () => t);
    const app = buildTaxApplication(input("AU", "AU_PTY_LTD", addresses.melbourne));
    const { reference } = await adapter.submit(app, { filingId: "f" });
    t = 1;
    const issued = await adapter.poll(reference, app);
    expect(issued.status === "ISSUED" && issued.taxId.replace(/\s/g, "").endsWith("650000017")).toBe(true);
  });
});
