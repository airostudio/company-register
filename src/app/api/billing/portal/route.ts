import { NextResponse, type NextRequest } from "next/server";
import { paymentsMode } from "@/server/payments";
import { getStripe } from "@/server/payments/stripe";
import { getCurrentUser } from "@/server/session";
import { appUrl } from "@/server/urls";

/** POST /api/billing/portal — open the Stripe customer portal to manage plans, cards and invoices. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  const base = appUrl(request);
  if (!user) return NextResponse.redirect(`${base}/login?redirectTo=/dashboard`, 303);
  if (paymentsMode() !== "stripe" || !user.stripeCustomerId) return NextResponse.redirect(`${base}/dashboard?billing=unavailable`, 303);
  const portal = await getStripe().billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${base}/dashboard` });
  return NextResponse.redirect(portal.url, 303);
}
