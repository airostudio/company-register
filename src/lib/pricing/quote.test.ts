import { describe, expect, it } from "vitest";
import { calculateQuote, resolveAddOns } from "./quote";

describe("calculateQuote", () => {
  it("separates the ASIC fee from service fees and applies GST only to service fees", () => {
    const q = calculateQuote({ jurisdiction: "AU", entityType: "AU_PTY_LTD", addOns: [], plan: "PAY_AS_YOU_GO", useAddressService: false });
    expect(q.currency).toBe("AUD");
    expect(q.totals.government).toBe(611_00);
    expect(q.totals.service).toBe(149_00);
    expect(q.totals.tax).toBe(14_90);
    expect(q.totals.dueToday).toBe(611_00 + 149_00 + 14_90);
    expect(q.lineItems.find((i) => i.category === "GOVERNMENT")?.taxable).toBe(false);
  });

  it("adds the registry's expedite fee as a separate government line", () => {
    const q = calculateQuote({ jurisdiction: "US_DE", entityType: "US_LLC", addOns: ["EXPEDITED"], plan: "PAY_AS_YOU_GO", useAddressService: true });
    const gov = q.lineItems.filter((i) => i.category === "GOVERNMENT").map((i) => i.amount);
    expect(gov).toEqual([110_00, 100_00]);
    expect(q.totals.tax).toBe(0);
  });

  it("forces the registered agent when the address service is chosen in the US, and zero-prices plan inclusions", () => {
    const input = { jurisdiction: "US_WY" as const, entityType: "US_LLC" as const, addOns: ["TAX_ID" as const], useAddressService: true };
    expect(resolveAddOns({ ...input, plan: "PAY_AS_YOU_GO" })).toEqual(["TAX_ID", "REGISTERED_AGENT"]);

    const pro = calculateQuote({ ...input, plan: "COMPLIANCE_PRO" });
    const agent = pro.lineItems.find((i) => i.id === "addon-REGISTERED_AGENT")!;
    expect(agent.amount).toBe(0);
    expect(agent.listAmount).toBe(125_00);
    expect(pro.totals.renewsAnnually).toBe(349_00);
  });

  it("ignores add-ons that are unavailable or managed by the details step", () => {
    const addOns = resolveAddOns({
      jurisdiction: "UK",
      entityType: "UK_LTD",
      addOns: ["FOREIGN_FOUNDER", "VIRTUAL_OFFICE", "BANKING_PARTNER"],
      plan: "PAY_AS_YOU_GO",
      useAddressService: false,
    });
    expect(addOns).toEqual(["BANKING_PARTNER"]);
  });

  it("applies UK VAT to service fees and plans but not the Companies House fee", () => {
    const q = calculateQuote({ jurisdiction: "UK", entityType: "UK_LTD", addOns: [], plan: "COMPLIANCE_ESSENTIALS", useAddressService: true });
    // service 49 + registered office 39 + plan 99 = 187 → 20% VAT = 37.40
    expect(q.totals.tax).toBe(37_40);
    expect(q.totals.government).toBe(50_00);
  });
});
