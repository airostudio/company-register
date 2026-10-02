import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { errorResponse } from "@/server/errors";
import { getSessionUserId } from "@/server/session";
import { resendSignature } from "@/server/signatures/service";

/** POST /api/filings/:id/signatures/:sigId/resend — email the signer a fresh link (company owner only). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; sigId: string }> }) {
  const { id, sigId } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue" } }, { status: 401 });
  try {
    const signature = await db().signatureRequest.findFirst({ where: { id: sigId, filingId: id, filing: { company: { ownerId: userId } } } });
    if (!signature) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
    await resendSignature(signature);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
