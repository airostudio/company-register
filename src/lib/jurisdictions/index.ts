import type { EntityType, Jurisdiction } from "@/lib/domain";
import { australia } from "./au";
import { unitedKingdom } from "./uk";
import { delaware, wyoming } from "./us";
import type { EntityTypeProfile, JurisdictionProfile } from "./types";

export type * from "./types";
export { SIC_CODES } from "./uk";

export const JURISDICTION_PROFILES: Record<Jurisdiction, JurisdictionProfile> = {
  AU: australia,
  US_DE: delaware,
  US_WY: wyoming,
  UK: unitedKingdom,
};

export function getJurisdiction(code: Jurisdiction): JurisdictionProfile {
  return JURISDICTION_PROFILES[code];
}

export function listJurisdictions(): JurisdictionProfile[] {
  return Object.values(JURISDICTION_PROFILES);
}

export function findEntityProfile(
  jurisdiction: Jurisdiction,
  entityType: EntityType,
): EntityTypeProfile | undefined {
  return getJurisdiction(jurisdiction).entityTypes.find((e) => e.type === entityType);
}

export function getEntityProfile(jurisdiction: Jurisdiction, entityType: EntityType): EntityTypeProfile {
  const profile = findEntityProfile(jurisdiction, entityType);
  if (!profile) {
    throw new Error(`Entity type ${entityType} is not available in ${jurisdiction}`);
  }
  return profile;
}

export function isEntityTypeAvailable(jurisdiction: Jurisdiction, entityType: EntityType): boolean {
  return findEntityProfile(jurisdiction, entityType) !== undefined;
}

/** "Acme" + "Pty Ltd" → "Acme Pty Ltd" */
export function composeCompanyName(baseName: string, suffix: string): string {
  return `${baseName.trim().replace(/\s+/g, " ")} ${suffix}`.trim();
}
