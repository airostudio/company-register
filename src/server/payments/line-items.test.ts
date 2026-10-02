import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/pricing/quote";
import { toCheckoutLineItems } from "./line-items";

describe("toCheckoutLineItems", () => {
  it("keeps government fees, service fees and tax as separate one-time lines", () => {
    const quote = calculateQuote({ jurisdiction: "AU", entityType: "AU_PTY_LTD", addOns: ["TAX_ID"], plan: "PAY_AS_YOU_GO", useAddressService: false });
    const { mode, lineItems } = toCheckoutLineItems(quote.lineItems, quote.currency);
    expect(mode).toBe("payment");
    expect(lineItems.map((l) => [l.price_data?.product_data?.name, l.price_data?.unit_amount])).toEqual([
      ["ASIC registration fee", 611_00],
      ["Pty Ltd formation service", 149_00],
      ["ABN, TFN & GST registration", 79_00],
      ["GST (10% on service fees)", 22_80],
    ]);
    expect(lineItems.every((l) => l.price_data?.currency === "aud" && !l.price_data.recurring)).toBe(true);
    expect(lineItems.reduce((a, l) => a + (l.price_data?.unit_amount ?? 0), 0)).toBe(quote.totals.dueToday);
  });

  it("uses subscription mode with yearly prices for plans, and drops included (zero) items", () => {
    const quote = calculateQuote({ jurisdiction: "US_WY", entityType: "US_LLC", addOns: ["TAX_ID"], plan: "COMPLIANCE_PRO", useAddressService: true });
    const { mode, lineItems } = toCheckoutLineItems(quote.lineItems, quote.currency);
    expect(mode).toBe("subscription");
    const names = lineItems.map((l) => l.price_data?.product_data?.name);
    expect(names).not.toContain("Registered agent (first year)"); // included in Pro → $0
    const plan = lineItems.find((l) => l.price_data?.product_data?.name === "Compliance Pro (annual)");
    expect(plan?.price_data?.recurring).toEqual({ interval: "year" });
    expect(plan?.price_data?.unit_amount).toBe(349_00);
  });
});
