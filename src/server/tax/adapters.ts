import { stableHash } from "@/lib/registry/mock/simulator";
import type { Jurisdiction } from "@/lib/domain";
import { registryMode } from "@/lib/registry";
import type { TaxApplication } from "@/lib/tax/application";
import { abnFromAcn, einFromSeed, utrFromSeed } from "@/lib/tax/ids";
import { db } from "../db";
import { createOpsTask, type OpsTaskDocument } from "../ops/tasks";
import { storage } from "../storage";

export type TaxStatus =
  | { status: "PENDING"; stage: "PREPARING" | "SUBMITTED"; message: string; nextPollInMs: number }
  | { status: "ISSUED"; taxId: string; issuedAt: string; document?: { title: string; content: Uint8Array } }
  | { status: "ACTION_REQUIRED" | "REJECTED"; message: string };

/** One tax authority integration (IRS EIN, ABR ABN, HMRC UTR). */
export interface ITaxRegistrationAdapter {
  readonly mode: "mock" | "assisted";
  submit(application: TaxApplication, ctx: { companyId: string; filingId: string }): Promise<{ reference: string }>;
  poll(reference: string, application: TaxApplication): Promise<TaxStatus>;
}

/** Deterministic simulator: issues a correctly formatted number after a short delay. */
export class MockTaxAdapter implements ITaxRegistrationAdapter {
  readonly mode = "mock" as const;
  constructor(
    private readonly speed = Number(process.env.MOCK_REGISTRY_SPEED ?? 1),
    private readonly now: () => number = Date.now,
  ) {}

  async submit(application: TaxApplication, ctx: { filingId: string }) {
    return { reference: `TAXMOCK-${application.authority}-${this.now().toString(36)}-${stableHash(ctx.filingId).toString(36)}` };
  }

  async poll(reference: string, application: TaxApplication): Promise<TaxStatus> {
    const [, , ts, hash] = reference.split("-");
    const submittedAt = parseInt(ts ?? "0", 36);
    // The IRS takes ~4 weeks by fax for foreign applicants; scaled down heavily for the simulator.
    const delay = (application.foreignApplicant ? 20_000 : 8_000) * this.speed;
    if (this.now() - submittedAt < delay) {
      return { status: "PENDING", stage: "SUBMITTED", message: `Application lodged with the ${application.authority}.`, nextPollInMs: Math.max(1_000, delay / 2) };
    }
    const seed = parseInt(hash ?? "0", 36);
    const taxId =
      application.authority === "ABR" ? abnFromAcn(application.registryNumber) : application.authority === "IRS" ? einFromSeed(seed) : utrFromSeed(seed);
    return { status: "ISSUED", taxId, issuedAt: new Date(submittedAt + delay).toISOString() };
  }
}

/** Staff complete the authority's form; the adapter reads the ops task. */
export class AssistedTaxAdapter implements ITaxRegistrationAdapter {
  readonly mode = "assisted" as const;

  async submit(application: TaxApplication, ctx: { companyId: string; filingId: string }) {
    const existing = await db().opsTask.findFirst({ where: { filingId: ctx.filingId, kind: "TAX_REGISTRATION" } });
    const task =
      existing ??
      (await createOpsTask({
        kind: "TAX_REGISTRATION",
        authority: application.authority,
        jurisdiction: application.jurisdiction,
        companyId: ctx.companyId,
        filingId: ctx.filingId,
        payload: application,
        summary: `${application.form} for ${application.companyName}${application.foreignApplicant ? " (foreign applicant)" : ""}`,
      }));
    return { reference: task.reference };
  }

  async poll(reference: string): Promise<TaxStatus> {
    const task = await db().opsTask.findUniqueOrThrow({ where: { reference } });
    switch (task.status) {
      case "OPEN":
      case "IN_PROGRESS":
        return { status: "PENDING", stage: "PREPARING", message: "Our team is preparing your application.", nextPollInMs: 60 * 60_000 };
      case "SUBMITTED":
        return { status: "PENDING", stage: "SUBMITTED", message: `Lodged with the ${task.authority}${task.externalReference ? ` (reference ${task.externalReference})` : ""}.`, nextPollInMs: 60 * 60_000 };
      case "ACTION_REQUIRED":
        return { status: "ACTION_REQUIRED", message: task.message ?? "We need more information." };
      case "REJECTED":
        return { status: "REJECTED", message: task.message ?? "The application was refused." };
      case "COMPLETED": {
        const upload = ((task.documents as OpsTaskDocument[] | null) ?? [])[0];
        return {
          status: "ISSUED",
          taxId: task.resultNumber!,
          issuedAt: (task.resultDate ?? task.completedAt ?? new Date()).toISOString(),
          document: upload ? { title: upload.title, content: await storage().get(upload.storageKey) } : undefined,
        };
      }
    }
  }
}

/** TAX_MODE_<J> / TAX_MODE override; otherwise follow the registry mode (mock ↔ mock, live → assisted). */
export function taxAdapterFor(jurisdiction: Jurisdiction): ITaxRegistrationAdapter {
  const mode = process.env[`TAX_MODE_${jurisdiction}`] ?? process.env.TAX_MODE ?? (registryMode(jurisdiction) === "live" ? "assisted" : "mock");
  return mode === "assisted" ? new AssistedTaxAdapter() : new MockTaxAdapter();
}

export function taxAdapterForReference(reference: string): ITaxRegistrationAdapter {
  return reference.startsWith("TAXMOCK-") ? new MockTaxAdapter() : new AssistedTaxAdapter();
}
