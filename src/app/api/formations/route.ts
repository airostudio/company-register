import { NextResponse, type NextRequest } from "next/server";
import type { CreateFormationResponse } from "@/lib/api-types";
import { parseFormationApplication } from "@/lib/validation/formation";
import { errorResponse } from "@/server/errors";
import { createFormation } from "@/server/formations/create";
import { assertMockPaymentsAllowed, paymentsMode, settleWithMockProvider, startCheckout } from "@/server/payments";
import { sendLoginLink } from "@/server/auth";
import { createSession, getSessionUserId } from "@/server/session";
import { appUrl } from "@/server/urls";

/** POST /api/formations — validate, price, persist and queue a formation for lodgement. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = parseFormationApplication(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: "Some details need attention", issues: parsed.issues } },
      { status: 422 },
    );
  }

  try {
    assertMockPaymentsAllowed();
    const sessionUserId = await getSessionUserId();
    const created = await createFormation(parsed.data, sessionUserId);
    if (!sessionUserId) await createSession(created.userId);
    if (created.newUser) {
      // New accounts get a session straight away but must confirm the email address.
      await sendLoginLink({ email: parsed.data.review.contactEmail, redirectTo: "/dashboard", baseUrl: appUrl(request), purpose: "verification" });
    }
    let checkoutUrl: string | undefined;
    if (paymentsMode() === "stripe") {
      checkoutUrl = await startCheckout(created.orderId, appUrl(request));
    } else {
      await settleWithMockProvider(created.orderId);
    }
    return NextResponse.json<CreateFormationResponse>(
      { companyId: created.companyId, filingId: created.filingId, quote: created.quote, checkoutUrl },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
