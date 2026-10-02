import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { errorResponse } from "@/server/errors";
import { paymentsMode, settleWithMockProvider, startCheckout } from "@/server/payments";
import { getSessionUserId } from "@/server/session";
import { appUrl } from "@/server/urls";
import { clientIp, enforceRateLimits, RATE_LIMITS } from "@/server/rate-limit";

/** POST /api/filings/:id/checkout — (re)start payment for an unpaid formation. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const limited = await enforceRateLimits([[RATE_LIMITS.formationIp, clientIp(request)]]);
  if (limited) return limited;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue" } }, { status: 401 });
  try {
    const order = await db().order.findFirst({ where: { filingId: id, company: { ownerId: userId } } });
    if (!order) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Order not found" } }, { status: 404 });
    if (order.status === "PAID") return NextResponse.json({ error: { code: "ALREADY_PAID", message: "Already paid" } }, { status: 409 });
    if (paymentsMode() === "mock") {
      await settleWithMockProvider(order.id);
      return NextResponse.json({ paid: true });
    }
    return NextResponse.json({ checkoutUrl: await startCheckout(order.id, appUrl(request)) });
  } catch (error) {
    return errorResponse(error);
  }
}
