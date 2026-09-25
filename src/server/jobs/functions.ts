import { failFiling, fulfilApprovedFiling, lodgeFiling, syncFilingStatus } from "../formations/lodgement";
import { filingQueued, inngest } from "./client";

const MAX_POLLS = 120;

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

    for (let attempt = 0; !state.settled && attempt < MAX_POLLS; attempt++) {
      await step.sleep(`wait-${attempt}`, Math.min(Math.max(state.nextPollInMs ?? 5_000, 1_000), 60_000));
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
