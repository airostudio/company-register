import { eventType, Inngest, staticSchema } from "inngest";

export const inngest = new Inngest({ id: "globalcorp-hub" });

/** Emitted once a paid formation is persisted and ready to lodge. */
export const filingQueued = eventType("formation/filing.queued", {
  schema: staticSchema<{ filingId: string }>(),
});

/** Background jobs run through Inngest when configured, otherwise inline (local dev without Inngest). */
export function jobRunner(): "inngest" | "inline" {
  if (process.env.JOB_RUNNER === "inline") return "inline";
  if (process.env.JOB_RUNNER === "inngest" || process.env.INNGEST_EVENT_KEY || process.env.INNGEST_DEV) return "inngest";
  return "inline";
}
