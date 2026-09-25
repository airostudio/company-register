import { after } from "next/server";
import { lodgeFiling } from "../formations/lodgement";
import { filingQueued, inngest, jobRunner } from "./client";

/**
 * Kick off lodgement for a newly queued filing.
 *
 * With Inngest configured the durable workflow in ./functions.ts takes over.
 * Otherwise (local dev) we lodge right after the response is sent and later
 * status changes are pulled in by GET /api/filings/[id] (poll-on-read).
 */
export async function dispatchFilingLodgement(filingId: string): Promise<void> {
  if (jobRunner() === "inngest") {
    await inngest.send(filingQueued.create({ filingId }));
    return;
  }
  after(async () => {
    try {
      await lodgeFiling(filingId);
    } catch (error) {
      console.error(`[jobs] inline lodgement failed for ${filingId}`, error);
    }
  });
}
