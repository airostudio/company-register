import { z } from "zod";
import { australia } from "@/lib/jurisdictions/au";
import { unitedKingdom } from "@/lib/jurisdictions/uk";
import { delaware } from "@/lib/jurisdictions/us";
import type { AddressRules } from "@/lib/jurisdictions/types";
import { countryName } from "@/lib/countries";

/**
 * Structural address shape. Content rules depend on what the address is used
 * for (registered office vs. residential) and the jurisdiction, so they are
 * applied with `checkAddress` inside each step's superRefine.
 */
export const addressSchema = z.object({
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  region: z.string(),
  postcode: z.string(),
  country: z.string(),
});
export type Address = z.infer<typeof addressSchema>;

export function emptyAddress(country = ""): Address {
  return { line1: "", line2: "", city: "", region: "", postcode: "", country };
}

/** Postcode / region formats for countries we know how to validate. */
const ADDRESS_FORMATS: Record<string, Pick<AddressRules, "postcodePattern" | "postcodeLabel" | "regions" | "regionLabel">> = {
  AU: australia.address,
  US: delaware.address,
  GB: unitedKingdom.address,
};

export function addressFormatFor(country: string) {
  return ADDRESS_FORMATS[country];
}

const PO_BOX = /\b(p\.?\s*o\.?\s*box|gpo\s*box|post\s*office\s*box|locked\s*bag|private\s*bag)\b/i;

export type IssuePath = (string | number)[];

export function addIssue(ctx: z.RefinementCtx, path: IssuePath, message: string) {
  ctx.addIssue({ code: "custom", message, path });
}

export interface AddressCheckOptions {
  /** Reject PO boxes / locked bags. */
  requirePhysical?: boolean;
  requiredCountry?: string;
  requiredRegion?: { code: string; message: string };
}

export function checkAddress(
  ctx: z.RefinementCtx,
  address: Address | undefined,
  path: IssuePath,
  opts: AddressCheckOptions = {},
): void {
  if (!address) {
    addIssue(ctx, path, "Address is required");
    return;
  }
  if (address.line1.trim().length < 3) addIssue(ctx, [...path, "line1"], "Enter a street address");
  if (!address.city.trim()) addIssue(ctx, [...path, "city"], "Enter a city or suburb");
  if (!address.country) {
    addIssue(ctx, [...path, "country"], "Select a country");
    return;
  }
  if (opts.requirePhysical && PO_BOX.test(`${address.line1} ${address.line2 ?? ""}`)) {
    addIssue(ctx, [...path, "line1"], "This must be a physical street address — PO boxes and locked bags aren't accepted");
  }
  if (opts.requiredCountry && address.country !== opts.requiredCountry) {
    addIssue(ctx, [...path, "country"], `This address must be in ${countryName(opts.requiredCountry)}`);
  }

  const format = ADDRESS_FORMATS[address.country];
  if (format) {
    if (!format.regions.some((r) => r.code === address.region)) {
      addIssue(ctx, [...path, "region"], `Select a ${format.regionLabel.toLowerCase()}`);
    }
    if (!format.postcodePattern.test(address.postcode.trim())) {
      addIssue(ctx, [...path, "postcode"], `Enter a valid ${format.postcodeLabel.toLowerCase()}`);
    }
  }
  if (opts.requiredRegion && address.region && address.region !== opts.requiredRegion.code) {
    addIssue(ctx, [...path, "region"], opts.requiredRegion.message);
  }
}

export function formatAddress(address: Address | undefined | null): string {
  if (!address) return "";
  return [address.line1, address.line2, address.city, [address.region, address.postcode].filter(Boolean).join(" "), countryName(address.country)]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
}
