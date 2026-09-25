import { NextResponse, type NextRequest } from "next/server";
import type { FilingView } from "@/lib/api-types";
import { errorResponse } from "@/server/errors";
import { fulfilApprovedFiling, lodgeFiling, syncFilingStatus } from "@/server/formations/lodgement";
import { jobRunner } from "@/server/jobs/client";
import { getFilingView } from "@/server/queries";
import { getSessionUserId } from "@/server/session";

const INLINE_POLL_INTERVAL_MS = 2_000;
const INLINE_LODGE_GRACE_MS = 10_000;

/** GET /api/filings/:id — lodgement progress for the checkout tracker and dashboard. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to view this filing" } }, { status: 401 });

  try {
    let view = await getFilingView(id, userId);
    if (!view) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Filing not found" } }, { status: 404 });

    // Without a background runner, advance the filing when someone is watching it.
    if (jobRunner() === "inline" && (await advanceInline(view))) {
      view = (await getFilingView(id, userId))!;
    }
    return NextResponse.json<FilingView>(view, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

async function advanceInline(view: FilingView): Promise<boolean> {
  const lastEventAt = new Date(view.events.at(-1)?.createdAt ?? 0).getTime();
  if (view.status === "QUEUED" && Date.now() - lastEventAt > INLINE_LODGE_GRACE_MS) {
    await lodgeFiling(view.id).catch((e) => console.error("[filings] inline lodge retry failed", e));
    return true;
  }
  if (view.status === "APPROVED") {
    if (view.documents.length === 0) {
      await fulfilApprovedFiling(view.id);
      return true;
    }
    return false;
  }
  if (!view.settled && view.registryReference && Date.now() - lastEventAt > INLINE_POLL_INTERVAL_MS) {
    const result = await syncFilingStatus(view.id);
    if (result.status === "APPROVED") await fulfilApprovedFiling(view.id);
    return result.status !== view.status;
  }
  return false;
}
