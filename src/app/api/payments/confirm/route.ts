import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/server/errors";
import { confirmCheckoutSession } from "@/server/payments";
import { getSessionUserId } from "@/server/session";

/** GET /api/payments/confirm?session_id=… — called after the Stripe redirect, in case the webhook is late. */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue" } }, { status: 401 });
  if (!sessionId) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "session_id is required" } }, { status: 400 });
  try {
    return NextResponse.json(await confirmCheckoutSession(sessionId, userId));
  } catch (error) {
    return errorResponse(error);
  }
}
