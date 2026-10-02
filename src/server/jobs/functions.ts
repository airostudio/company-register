import { failFiling, fulfilApprovedFiling, lodgeFiling, syncFilingStatus } from "../formations/lodgement";
import { filingQueued, inngest } from "./client";

/** Registries can take days (assisted lodgement), so poll for up to a week; staff actions also sync immediately. */
const POLL_BUDGET_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_POLLS = 400;

/**
 * Durable lodgement workflow:
 *   lodge → poll the registry (sleeping between polls) → fulfil on approval.
 * Each step is checkpointed by Inngest, so retries resume where they left off.
 */
export const lodgeFormation = inngest.createFunction(
  {
    id: "lodge-formation",
    name: "Lodge formation with registry",
    triggers: [filingQueued],
    retries: 5,
    concurrency: { key: "event.data.filingId", limit: 1 },
    onFailure: async ({ event, error }) => {
      await failFiling(event.data.event.data.filingId as string, error.message);
    },
  },
  async ({ event, step }) => {
    const { filingId } = event.data;

    let state = await step.run("submit-to-registry", () => lodgeFiling(filingId));

    const startedAt = await step.run("started-at", () => Date.now());
    for (let attempt = 0; !state.settled && attempt < MAX_POLLS && Date.now() - startedAt < POLL_BUDGET_MS; attempt++) {
      await step.sleep(`wait-${attempt}`, Math.min(Math.max(state.nextPollInMs ?? 5_000, 1_000), 60 * 60_000));
      state = await step.run(`poll-status-${attempt}`, () => syncFilingStatus(filingId));
    }

    if (state.status === "APPROVED") {
      const fulfilled = await step.run("generate-documents-and-calendar", () => fulfilApprovedFiling(filingId));
      return { status: state.status, ...fulfilled };
    }
    return { status: state.status };
  },
);

export const functions = [lodgeFormation];
