import type Stripe from "stripe";
import type { Currency } from "@/lib/domain";
import type { QuoteLineItem } from "@/lib/pricing/quote";

export type CheckoutLineItem = Stripe.Checkout.SessionCreateParams.LineItem;

/**
 * Map our transparent quote onto Stripe Checkout line items. Government fees,
 * service fees and tax stay separate lines, so the Stripe receipt matches the quote.
 * Zero-priced lines (plan inclusions) are dropped. Recurring lines become yearly prices,
 * which switches the session to subscription mode.
 */
export function toCheckoutLineItems(items: QuoteLineItem[], currency: Currency): { mode: "payment" | "subscription"; lineItems: CheckoutLineItem[] } {
  const lineItems: CheckoutLineItem[] = items
    .filter((item) => item.amount > 0)
    .map((item) => ({
      quantity: 1,
      price_data: {
        currency: currency.toLowerCase(),
        unit_amount: item.amount,
        product_data: {
          name: item.label,
          description: item.note,
          metadata: { lineItemId: item.id, category: item.category },
        },
        ...(item.recurring === "year" ? { recurring: { interval: "year" as const } } : {}),
      },
    }));
  const mode = items.some((i) => i.recurring === "year" && i.amount > 0) ? "subscription" : "payment";
  return { mode, lineItems };
}
