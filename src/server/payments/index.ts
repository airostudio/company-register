import type Stripe from "stripe";
import { PLANS } from "@/lib/pricing/catalog";
import type { QuoteLineItem } from "@/lib/pricing/quote";
import type { Currency, SubscriptionPlan } from "@/lib/domain";
import type { FormationApplication } from "@/lib/validation/formation";
import { db } from "../db";
import { AppError } from "../errors";
import { transition } from "../formations/lodgement";
import { dispatchFilingLodgement } from "../jobs/dispatch";
import { toCheckoutLineItems } from "./line-items";
import { getStripe, paymentsMode } from "./stripe";

export { paymentsMode } from "./stripe";

/**
 * Create a Stripe Checkout session for a pending order and return its URL.
 * Safe to call again after a session expired or was abandoned.
 */
export async function startCheckout(orderId: string, baseUrl: string): Promise<string> {
  const prisma = db();
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { company: { include: { owner: true } } },
  });
  if (order.status === "PAID") throw new AppError(409, "ALREADY_PAID", "This order has already been paid");

  const { mode, lineItems } = toCheckoutLineItems(order.lineItems as unknown as QuoteLineItem[], order.currency as Currency);
  const owner = order.company.owner;
  const attempt = await prisma.order.update({ where: { id: orderId }, data: { updatedAt: new Date() }, select: { updatedAt: true } });
  const metadata = { orderId: order.id, companyId: order.companyId, filingId: order.filingId ?? "" };

  const session = await getStripe().checkout.sessions.create(
    {
      mode,
      line_items: lineItems,
      client_reference_id: order.id,
      metadata,
      ...(owner.stripeCustomerId ? { customer: owner.stripeCustomerId } : { customer_email: owner.email }),
      ...(mode === "payment" ? { payment_intent_data: { metadata }, customer_creation: owner.stripeCustomerId ? undefined : "always" } : { subscription_data: { metadata } }),
      success_url: `${baseUrl}/register?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/register?checkout=cancelled`,
    },
    // A new key per attempt: the same attempt is retried safely, a later one gets a fresh session.
    { idempotencyKey: `checkout_${order.id}_${attempt.updatedAt.getTime()}` },
  );
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");

  await prisma.order.update({
    where: { id: orderId },
    data: { status: "PENDING", checkoutSessionId: session.id, checkoutUrl: session.url, paymentProvider: "stripe" },
  });
  return session.url;
}

export interface PaymentDetails {
  provider: "stripe" | "mock";
  reference: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

/**
 * The single place an order becomes paid (Stripe webhook, return-URL
 * confirmation or mock provider). Every step is idempotent and re-runs on a
 * retry, so a failure half-way (e.g. a webhook 500) is repaired by the next
 * delivery instead of leaving a paid order stuck in DRAFT.
 */
export async function markOrderPaid(orderId: string, payment: PaymentDetails): Promise<boolean> {
  const prisma = db();
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, status: { in: ["PENDING", "EXPIRED"] } },
    data: { status: "PAID", paidAt: new Date(), paymentProvider: payment.provider, paymentReference: payment.reference, checkoutUrl: null },
  });
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { company: true, filing: true } });
  if (order.status !== "PAID") return false;

  // Lodgement is the critical path, so queue it before any bookkeeping that could fail.
  if (order.filing?.status === "DRAFT") {
    const moved = await transition(order.filing, "DRAFT", "QUEUED", "Payment received — queued for lodgement.", {}, { provider: payment.provider, reference: payment.reference });
    if (moved) await dispatchFilingLodgement(order.filing.id);
  }

  if (payment.stripeCustomerId) {
    // Best effort: a customer already linked to another account must not block anything.
    await prisma.user
      .updateMany({ where: { id: order.company.ownerId, stripeCustomerId: null }, data: { stripeCustomerId: payment.stripeCustomerId } })
      .catch((error) => console.warn(`[payments] couldn't link Stripe customer ${payment.stripeCustomerId}: ${error.message}`));
  }

  const plan = (order.company.formationPayload as unknown as FormationApplication | null)?.addons.plan ?? "PAY_AS_YOU_GO";
  if (plan !== "PAY_AS_YOU_GO") {
    await activateSubscription(order.company.ownerId, order.companyId, plan, payment.stripeSubscriptionId).catch((error) =>
      console.error(`[payments] couldn't record ${plan} subscription for company ${order.companyId}: ${error.message}`),
    );
  }
  return count > 0;
}

async function activateSubscription(userId: string, companyId: string, plan: SubscriptionPlan, externalId?: string) {
  const now = new Date();
  const end = new Date(now);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  const data = {
    plan,
    status: "ACTIVE" as const,
    includesRegisteredAgent: PLANS[plan].includes.includes("REGISTERED_AGENT"),
    currentPeriodStart: now,
    currentPeriodEnd: end,
    externalId: externalId ?? null,
  };
  const existing = await db().subscription.findUnique({ where: { companyId } });
  if (existing?.status === "ACTIVE" && (!externalId || existing.externalId === externalId)) return; // already applied
  await db().subscription.upsert({ where: { companyId }, create: { userId, companyId, ...data }, update: data });
}

function idOf(value: string | { id: string } | null | undefined): string | undefined {
  return typeof value === "string" ? value : value?.id;
}

async function onCheckoutPaid(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId || session.payment_status === "unpaid") return;
  await markOrderPaid(orderId, {
    provider: "stripe",
    reference: idOf(session.payment_intent) ?? idOf(session.invoice) ?? session.id,
    stripeCustomerId: idOf(session.customer),
    stripeSubscriptionId: idOf(session.subscription),
  });
}

/** Apply a verified Stripe webhook event. Every branch is idempotent. */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const prisma = db();
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await onCheckoutPaid(event.data.object);
      return;
    case "checkout.session.expired": {
      const orderId = event.data.object.metadata?.orderId;
      if (orderId) await prisma.order.updateMany({ where: { id: orderId, status: "PENDING", checkoutSessionId: event.data.object.id }, data: { status: "EXPIRED", checkoutUrl: null } });
      return;
    }
    case "invoice.paid": {
      const subscriptionId = idOf(event.data.object.parent?.subscription_details?.subscription);
      if (!subscriptionId) return;
      const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
      const item = subscription.items.data[0];
      if (!item) return;
      await prisma.subscription.updateMany({
        where: { externalId: subscriptionId },
        data: {
          status: "ACTIVE",
          currentPeriodStart: new Date(item.current_period_start * 1000),
          currentPeriodEnd: new Date(item.current_period_end * 1000),
        },
      });
      return;
    }
    case "invoice.payment_failed": {
      const subscriptionId = idOf(event.data.object.parent?.subscription_details?.subscription);
      if (subscriptionId) await prisma.subscription.updateMany({ where: { externalId: subscriptionId }, data: { status: "PAST_DUE" } });
      return;
    }
    case "customer.subscription.updated":
      await prisma.subscription.updateMany({
        where: { externalId: event.data.object.id },
        data: { cancelAtPeriodEnd: event.data.object.cancel_at_period_end },
      });
      return;
    case "customer.subscription.deleted":
      await prisma.subscription.updateMany({ where: { externalId: event.data.object.id }, data: { status: "CANCELED" } });
      return;
    default:
      return;
  }
}

/** After the Stripe redirect: confirm the session directly in case the webhook hasn't arrived yet. */
export async function confirmCheckoutSession(sessionId: string, ownerId: string): Promise<{ paid: boolean; filingId?: string }> {
  const order = await db().order.findFirst({ where: { checkoutSessionId: sessionId, company: { ownerId } } });
  if (!order) throw new AppError(404, "NOT_FOUND", "Checkout session not found");
  if (order.status === "PAID") {
    await repairPaidOrder(order.id);
    return { paid: true, filingId: order.filingId ?? undefined };
  }
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.payment_status === "unpaid") return { paid: false, filingId: order.filingId ?? undefined };
  await onCheckoutPaid(session);
  return { paid: true, filingId: order.filingId ?? undefined };
}

/** Finish the post-payment steps for an order already recorded as PAID (no provider call needed). */
export async function repairPaidOrder(orderId: string): Promise<void> {
  const order = await db().order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "PAID") return;
  await markOrderPaid(order.id, {
    provider: order.paymentProvider === "stripe" ? "stripe" : "mock",
    reference: order.paymentReference ?? order.id,
  });
}

/** Settle immediately when no payment provider is configured (development / demos). */
export async function settleWithMockProvider(orderId: string): Promise<void> {
  await markOrderPaid(orderId, { provider: "mock", reference: `mock_${orderId}` });
}

export function assertMockPaymentsAllowed() {
  if (paymentsMode() === "mock" && process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PAYMENTS !== "1") {
    throw new AppError(503, "PAYMENTS_NOT_CONFIGURED", "Payments are not configured. Set STRIPE_SECRET_KEY (or ALLOW_MOCK_PAYMENTS=1 for demos).");
  }
}
