import type { Jurisdiction } from "@/lib/domain";
import { evaluateName, type RegisterEntry } from "../name-evaluation";
import { RESTRICTED_WORDS } from "../restricted-words";
import {
  RegistryError,
  type FilingReceipt,
  type FilingStatusResult,
  type FormationPayload,
  type IGovernmentRegistryAdapter,
  type NameAvailabilityResult,
  type NameCheckOptions,
  type OfficialDocument,
  type RegistryIssue,
} from "../types";

/**
 * Deterministic government-registry simulator.
 *
 * Filing IDs encode submission time, outcome and priority, so status can be
 * derived statelessly (it survives dev-server restarts and works across
 * serverless instances). Payloads are also kept in a process-local store so
 * approved filings can return "official" documents.
 *
 * Magic values for end-to-end testing (case-insensitive, in the company name):
 *   "requisition" → examiner raises a requisition (REQUIRES_ACTION)
 *   "reject"      → application rejected after review
 * Registered names in `takenNames` (plus anything lodged this session)
 * trigger NAME_CONFLICT; see each adapter for postcode rules.
 */

export type MockOutcome = "APPROVE" | "REQUISITION" | "REJECT";

const OUTCOME_CODE: Record<MockOutcome, string> = { APPROVE: "a", REQUISITION: "q", REJECT: "r" };
const CODE_OUTCOME: Record<string, MockOutcome> = { a: "APPROVE", q: "REQUISITION", r: "REJECT" };

export interface MockTimeline {
  /** Time from lodgement until an examiner picks it up. */
  toUnderReviewMs: number;
  /** Time from lodgement until a decision. */
  toDecisionMs: number;
  /** Multiplier applied when the filing is expedited. */
  expeditedFactor: number;
  /** Simulated API latency for name searches. */
  nameSearchLatencyMs: number;
}

export interface MockAdapterOptions {
  /** Scales all delays; 0 makes everything instant (tests). */
  speed?: number;
  /** Probability (0–1) that a submission fails with a transient SERVICE_UNAVAILABLE. */
  failureRate?: number;
  now?: () => number;
  random?: () => number;
}

interface StoredFiling {
  payload: FormationPayload;
  submittedAt: number;
}

type GlobalStore = { __gchMockRegistry?: Map<string, StoredFiling> };

function store(): Map<string, StoredFiling> {
  const g = globalThis as GlobalStore;
  g.__gchMockRegistry ??= new Map();
  return g.__gchMockRegistry;
}

/** FNV-1a — stable, dependency-free hash for deterministic mock numbers. */
export function stableHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

export abstract class MockRegistryAdapter implements IGovernmentRegistryAdapter {
  abstract readonly registryCode: string;
  abstract readonly jurisdictions: readonly Jurisdiction[];
  protected abstract readonly timeline: MockTimeline;
  /** Names already on the (simulated) register. */
  protected abstract readonly takenNames: readonly { name: string; number: string }[];

  /** Jurisdiction-specific business rules the registry enforces on lodgement. */
  protected abstract validateLodgement(payload: FormationPayload): RegistryIssue[];
  /** Format a registry number (ACN, file number, company number) from a seed. */
  protected abstract formatRegistryNumber(seed: number, incorporatedAt: Date, jurisdiction: Jurisdiction): string;
  protected abstract renderOfficialDocuments(
    payload: FormationPayload,
    registration: NonNullable<FilingStatusResult["registration"]>,
  ): Promise<OfficialDocument[]>;

  protected readonly speed: number;
  protected readonly failureRate: number;
  protected readonly now: () => number;
  protected readonly random: () => number;

  constructor(opts: MockAdapterOptions = {}) {
    this.speed = opts.speed ?? 1;
    this.failureRate = opts.failureRate ?? 0;
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
  }

  // ─── Name availability ────────────────────────────────────────────────────

  async checkNameAvailability(
    name: string,
    jurisdiction: Jurisdiction,
    options: NameCheckOptions = {},
  ): Promise<NameAvailabilityResult> {
    this.assertJurisdiction(jurisdiction);
    await sleep(this.timeline.nameSearchLatencyMs * this.speed);
    return evaluateName({
      query: name,
      jurisdiction,
      registryCode: this.registryCode,
      register: this.register(),
      restrictedWords: RESTRICTED_WORDS[jurisdiction],
      suggest: options.suggest !== false,
      now: new Date(this.now()),
    });
  }

  /** Static register plus everything lodged with this simulator in the current process. */
  private register(): RegisterEntry[] {
    const lodged = [...store().entries()]
      .filter(([, f]) => this.jurisdictions.includes(f.payload.jurisdiction))
      .map(([id, f]) => ({ name: f.payload.companyName, number: `pending ${id}` }));
    return [...this.takenNames, ...lodged];
  }

  // ─── Lodgement ────────────────────────────────────────────────────────────

  async submitFiling(payload: FormationPayload): Promise<FilingReceipt> {
    this.assertJurisdiction(payload.jurisdiction);
    await sleep(400 * this.speed);

    if (this.failureRate > 0 && this.random() < this.failureRate) {
      throw new RegistryError(this.registryCode, "SERVICE_UNAVAILABLE", `${this.registryCode} gateway timed out. Please retry.`);
    }

    const issues: RegistryIssue[] = [];
    const nameCheck = await this.checkNameAvailability(payload.companyName, payload.jurisdiction, { suggest: false });
    const identical = nameCheck.issues.find((i) => i.code === "IDENTICAL_NAME");
    if (identical) issues.push({ code: "NAME_CONFLICT", field: "companyName", message: identical.message });
    issues.push(...this.validateLodgement(payload));

    if (issues.length) {
      const primary = issues[0]!;
      throw new RegistryError(this.registryCode, primary.code, primary.message, issues);
    }

    const submittedAt = this.now();
    const outcome = this.decideOutcome(payload);
    const filingId = [
      this.registryCode,
      payload.jurisdiction,
      submittedAt.toString(36),
      `${OUTCOME_CODE[outcome]}${payload.expedited ? "x" : "s"}`,
      stableHash(payload.clientReference).toString(36),
    ].join("-");
    store().set(filingId, { payload, submittedAt });

    const { toDecisionMs } = this.effectiveTimeline(payload.expedited);
    return {
      filingId,
      status: "SUBMITTED",
      submittedAt: new Date(submittedAt).toISOString(),
      estimatedDecisionAt: new Date(submittedAt + toDecisionMs).toISOString(),
      message: `Lodged with ${this.registryCode}. Reference ${filingId}.`,
    };
  }

  protected decideOutcome(payload: FormationPayload): MockOutcome {
    if (/requisition/i.test(payload.companyName)) return "REQUISITION";
    if (/reject/i.test(payload.companyName)) return "REJECT";
    return "APPROVE";
  }

  protected effectiveTimeline(expedited: boolean) {
    const factor = this.speed * (expedited ? this.timeline.expeditedFactor : 1);
    return {
      toUnderReviewMs: this.timeline.toUnderReviewMs * factor,
      toDecisionMs: this.timeline.toDecisionMs * factor,
    };
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  async pollFilingStatus(filingId: string): Promise<FilingStatusResult> {
    const parsed = this.parseFilingId(filingId);
    const elapsed = this.now() - parsed.submittedAt;
    const { toUnderReviewMs, toDecisionMs } = this.effectiveTimeline(parsed.expedited);
    const updatedAt = new Date(this.now()).toISOString();

    if (elapsed < toUnderReviewMs) {
      return {
        filingId,
        status: "SUBMITTED",
        message: `Received by ${this.registryCode}, waiting for an examiner.`,
        updatedAt,
        nextPollInMs: Math.max(1000, toUnderReviewMs - elapsed),
      };
    }
    if (elapsed < toDecisionMs) {
      return {
        filingId,
        status: "UNDER_REVIEW",
        message: `An ${this.registryCode} examiner is reviewing the application.`,
        updatedAt,
        nextPollInMs: Math.max(1000, Math.min(toDecisionMs - elapsed, 15_000)),
      };
    }

    switch (parsed.outcome) {
      case "REQUISITION":
        return {
          filingId,
          status: "REQUIRES_ACTION",
          message: "The examiner raised a requisition. Provide the requested information to continue.",
          updatedAt,
          issues: [
            {
              code: "REQUISITION",
              field: "companyName",
              message: "Evidence is required that the proposed name is not misleading about the company's activities.",
            },
          ],
        };
      case "REJECT":
        return {
          filingId,
          status: "REJECTED",
          message: "The application was rejected.",
          updatedAt,
          issues: [
            {
              code: "NAME_CONFLICT",
              field: "companyName",
              message: "A company with an identical name was registered while this application was pending.",
            },
          ],
        };
      case "APPROVE": {
        const incorporatedAt = new Date(parsed.submittedAt + toDecisionMs);
        return {
          filingId,
          status: "APPROVED",
          message: `Registered by ${this.registryCode}.`,
          updatedAt,
          registration: {
            registryNumber: this.formatRegistryNumber(stableHash(filingId), incorporatedAt, parsed.jurisdiction),
            legalName: store().get(filingId)?.payload.companyName,
            incorporatedAt: incorporatedAt.toISOString(),
          },
        };
      }
    }
  }

  ownsReference(reference: string): boolean {
    try {
      this.parseFilingId(reference);
      return true;
    } catch {
      return false;
    }
  }

  async downloadOfficialDocuments(filingId: string): Promise<OfficialDocument[]> {
    const status = await this.pollFilingStatus(filingId);
    if (status.status !== "APPROVED" || !status.registration) {
      throw new RegistryError(this.registryCode, "NOT_READY", "Official documents are only available once the filing is approved.");
    }
    const stored = store().get(filingId);
    if (!stored) {
      throw new RegistryError(this.registryCode, "NOT_FOUND", `No lodgement data held for ${filingId} (simulator restarted?).`);
    }
    return this.renderOfficialDocuments(stored.payload, status.registration);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** `<registry>-<jurisdiction>-<ts36>-<outcome><priority>-<hash36>`; the registry code may contain dashes. */
  protected parseFilingId(filingId: string) {
    const parts = filingId.split("-");
    const hash = parts.pop();
    const flags = parts.pop();
    const ts = parts.pop();
    const jurisdiction = parts.pop() as Jurisdiction | undefined;
    const registry = parts.join("-");
    const submittedAt = ts ? parseInt(ts, 36) : NaN;
    const outcome = flags ? CODE_OUTCOME[flags[0]!] : undefined;
    if (
      registry !== this.registryCode ||
      !hash ||
      !jurisdiction ||
      !this.jurisdictions.includes(jurisdiction) ||
      !Number.isFinite(submittedAt) ||
      !outcome
    ) {
      throw new RegistryError(this.registryCode, "NOT_FOUND", `Unknown ${this.registryCode} filing reference: ${filingId}`);
    }
    return { jurisdiction, submittedAt, outcome, expedited: flags![1] === "x" };
  }

  protected assertJurisdiction(jurisdiction: Jurisdiction) {
    if (!this.jurisdictions.includes(jurisdiction)) {
      throw new RegistryError(this.registryCode, "UNSUPPORTED_JURISDICTION", `${this.registryCode} does not handle ${jurisdiction}`);
    }
  }
}

/** Test helper: forget everything lodged with the simulators. */
export function resetMockRegistry() {
  store().clear();
}
