import type { EntityType, Jurisdiction } from "@/lib/domain";
import { composeCompanyName, findEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import { MockAsicAdapter } from "./mock/asic";
import { MockCompaniesHouseAdapter } from "./mock/companies-house";
import type { MockAdapterOptions } from "./mock/simulator";
import { MockUsSecretaryOfStateAdapter } from "./mock/us-sos";
import { createLiveAdapters } from "@/server/registry/live";
import { RegistryError, type IGovernmentRegistryAdapter, type NameAvailabilityResult } from "./types";

export * from "./types";
export { buildFormationPayload } from "./payload";

export type RegistryMode = "mock" | "live";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** REGISTRY_MODE_<JURISDICTION> (e.g. REGISTRY_MODE_UK=live) overrides REGISTRY_MODE (default "mock"). */
export function registryMode(jurisdiction: Jurisdiction): RegistryMode {
  const value = process.env[`REGISTRY_MODE_${jurisdiction}`] ?? process.env.REGISTRY_MODE ?? "mock";
  return value === "live" ? "live" : "mock";
}

let mockAdapters: IGovernmentRegistryAdapter[] | undefined;
let liveAdapters: IGovernmentRegistryAdapter[] | undefined;

function mocks(): IGovernmentRegistryAdapter[] {
  const opts: MockAdapterOptions = {
    speed: envNumber("MOCK_REGISTRY_SPEED", 1),
    failureRate: envNumber("MOCK_REGISTRY_FAILURE_RATE", 0),
  };
  mockAdapters ??= [new MockAsicAdapter(opts), new MockUsSecretaryOfStateAdapter(opts), new MockCompaniesHouseAdapter(opts)];
  return mockAdapters;
}

function lives(): IGovernmentRegistryAdapter[] {
  liveAdapters ??= createLiveAdapters();
  return liveAdapters;
}

export function getRegistryAdapter(jurisdiction: Jurisdiction): IGovernmentRegistryAdapter {
  const pool = registryMode(jurisdiction) === "live" ? lives() : mocks();
  const adapter = pool.find((a) => a.jurisdictions.includes(jurisdiction));
  if (!adapter) {
    throw new RegistryError("GATEWAY", "UNSUPPORTED_JURISDICTION", `No registry adapter for ${jurisdiction}`);
  }
  return adapter;
}

/**
 * Resolve the adapter that issued a registry reference. References are
 * self-describing, so filings lodged before a mode switch still resolve.
 */
export function getRegistryAdapterForReference(reference: string): IGovernmentRegistryAdapter {
  const adapter = [...lives(), ...mocks()].find((a) => a.ownsReference(reference));
  if (!adapter) throw new RegistryError("GATEWAY", "NOT_FOUND", `Unrecognised registry reference ${reference}`);
  return adapter;
}

export interface MultiJurisdictionNameCheck {
  jurisdiction: Jurisdiction;
  entityType?: EntityType;
  result?: NameAvailabilityResult;
  error?: string;
}

/**
 * Check one distinctive name across several registries in parallel, applying
 * each jurisdiction's default legal ending ("Acme" → "Acme Pty Ltd", "Acme LLC", "Acme Ltd").
 */
export async function checkNameAcrossJurisdictions(
  baseName: string,
  targets: { jurisdiction: Jurisdiction; entityType?: EntityType; suffix?: string }[],
): Promise<MultiJurisdictionNameCheck[]> {
  return Promise.all(
    targets.map(async ({ jurisdiction, entityType, suffix }) => {
      const entity = entityType
        ? findEntityProfile(jurisdiction, entityType)
        : getJurisdiction(jurisdiction).entityTypes[0];
      const ending = suffix ?? entity?.suffixes[0] ?? "";
      try {
        const result = await getRegistryAdapter(jurisdiction).checkNameAvailability(
          composeCompanyName(baseName, ending),
          jurisdiction,
          { entityType: entity?.type },
        );
        return { jurisdiction, entityType: entity?.type, result };
      } catch (error) {
        return { jurisdiction, entityType: entity?.type, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
}
