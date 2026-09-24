import type { Jurisdiction } from "@/lib/domain";
import type { Address } from "@/lib/validation/address";

/**
 * Addresses used when a customer opts into our registered agent (US) or
 * registered office (AU/UK) service. Placeholder addresses — replace with the
 * real service-of-process addresses before going live.
 */
export const ADDRESS_SERVICE_PROVIDERS: Record<Jurisdiction, { name: string; address: Address }> = {
  AU: {
    name: "GlobalCorp Hub Registered Office Services Pty Ltd",
    address: { line1: "Level 12, 100 Harbour Street", city: "Sydney", region: "NSW", postcode: "2000", country: "AU" },
  },
  US_DE: {
    name: "GlobalCorp Registered Agents (Delaware) LLC",
    address: { line1: "400 Harbor Loop, Suite 210", city: "Wilmington", region: "DE", postcode: "19801", country: "US" },
  },
  US_WY: {
    name: "GlobalCorp Registered Agents (Wyoming) LLC",
    address: { line1: "225 Frontier Way, Suite 300", city: "Cheyenne", region: "WY", postcode: "82001", country: "US" },
  },
  UK: {
    name: "GlobalCorp Hub Company Services Ltd",
    address: { line1: "71 Kingsway Hub", city: "London", region: "ENG", postcode: "WC2B 6ST", country: "GB" },
  },
};
