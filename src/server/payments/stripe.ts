import Stripe from "stripe";

let client: Stripe | undefined;

/** "stripe" when STRIPE_SECRET_KEY is set; otherwise payments are simulated ("mock"). */
export function paymentsMode(): "stripe" | "mock" {
  return process.env.STRIPE_SECRET_KEY ? "stripe" : "mock";
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key, {
    maxNetworkRetries: 2,
    appInfo: { name: "GlobalCorp Hub" },
    // Test-only override, e.g. to point at stripe-mock. Never set in production.
    ...(process.env.STRIPE_API_HOST
      ? {
          host: process.env.STRIPE_API_HOST,
          port: process.env.STRIPE_API_PORT,
          protocol: (process.env.STRIPE_API_PROTOCOL as "http" | "https" | undefined) ?? "https",
        }
      : {}),
  });
  return client;
}
