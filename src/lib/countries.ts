import type { Country, Jurisdiction } from "@/lib/domain";

/** ISO-3166 alpha-2 codes for residential/person addresses (common founder countries first). */
export const ADDRESS_COUNTRIES: { code: string; name: string }[] = [
  { code: "AU", name: "Australia" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
  { code: "IN", name: "India" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "CN", name: "China" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "NG", name: "Nigeria" },
  { code: "ZA", name: "South Africa" },
  { code: "PH", name: "Philippines" },
  { code: "ID", name: "Indonesia" },
  { code: "MY", name: "Malaysia" },
  { code: "VN", name: "Vietnam" },
  { code: "PK", name: "Pakistan" },
  { code: "IL", name: "Israel" },
];

const COUNTRY_TO_ISO: Record<Country, string> = { AU: "AU", US: "US", UK: "GB" };

export function countryToIso(country: Country): string {
  return COUNTRY_TO_ISO[country];
}

export function jurisdictionIso(jurisdiction: Jurisdiction): string {
  return jurisdiction === "AU" ? "AU" : jurisdiction === "UK" ? "GB" : "US";
}

export function countryName(iso: string): string {
  return ADDRESS_COUNTRIES.find((c) => c.code === iso)?.name ?? iso;
}
