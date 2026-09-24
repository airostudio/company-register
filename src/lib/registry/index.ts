import type { EntityType, Jurisdiction } from "@/lib/domain";
import { composeCompanyName, findEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import { MockAsicAdapter } from "./mock/asic";
import { MockCompaniesHouseAdapter } from "./mock/companies-house";
import type { MockAdapterOptions } from "./mock/simulator";
import { MockUsSecretaryOfStateAdapter } from "./mock/us-sos";
import { RegistryError, type IGovernmentRegistryAdapter, type NameAvailabilityResult } from "./types";

export * from "./types";
export { buildFormationPayload } from "./payload";

export type RegistryMode = "mock" | "live";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function mockOptions(): MockAdapterOptions {
  return {
    speed: envNumber("MOCK_REGISTRY_SPEED", 1),
    failureRate: envNumber("MOCK_REGISTRY_FAILURE_RATE", 0),
  };
}

/**
 * Adapter factory. Live adapters (ASIC EDGE, Delaware ICIS, Companies House
 * XML Gateway) slot in here behind the same interface; until they exist the
 * "live" mode fails loudly rather than silently falling back to a mock.
 */
function createAdapters(mode: RegistryMode): IGovernmentRegistryAdapter[] {
  if (mode === "live") {
    throw new Error("Live registry adapters are not implemented yet — set REGISTRY_MODE=mock");
  }
  const opts = mockOptions();
  return [new MockAsicAdapter(opts), new MockUsSecretaryOfStateAdapter(opts), new MockCompaniesHouseAdapter(opts)];
}

let cached: { mode: RegistryMode; adapters: IGovernmentRegistryAdapter[] } | undefined;

function adapters(): IGovernmentRegistryAdapter[] {
  const mode = (process.env.REGISTRY_MODE as RegistryMode | undefined) ?? "mock";
  if (!cached || cached.mode !== mode) cached = { mode, adapters: createAdapters(mode) };
  return cached.adapters;
}

export function getRegistryAdapter(jurisdiction: Jurisdiction): IGovernmentRegistryAdapter {
  const adapter = adapters().find((a) => a.jurisdictions.includes(jurisdiction));
  if (!adapter) {
    throw new RegistryError("GATEWAY", "UNSUPPORTED_JURISDICTION", `No registry adapter for ${jurisdiction}`);
  }
  return adapter;
}

/** Resolve the adapter that issued a registry reference (e.g. "ASIC-AU-…"). */
export function getRegistryAdapterForReference(reference: string): IGovernmentRegistryAdapter {
  const adapter = adapters().find((a) => reference.startsWith(`${a.registryCode}-`));
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
