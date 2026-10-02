import { NextResponse, type NextRequest } from "next/server";
import { handleStripeEvent } from "@/server/payments";
import { getStripe } from "@/server/payments/stripe";

/** POST /api/webhooks/stripe — verified Stripe events (checkout, invoices, subscriptions). */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Stripe webhooks are not configured" }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  const payload = await request.text(); // raw body is required for signature verification
  let event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature ?? "", secret);
  } catch (error) {
    return NextResponse.json({ error: `Invalid signature: ${error instanceof Error ? error.message : error}` }, { status: 400 });
  }

  try {
    await handleStripeEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[stripe] failed to handle ${event.type} ${event.id}`, error);
    // A 500 makes Stripe retry with backoff; handlers are idempotent.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
