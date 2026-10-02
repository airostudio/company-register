/**
 * Stripe payment e2e: run against a server started in Stripe mode pointing at scripts/fake-stripe.mjs.
 *   BASE_URL=http://localhost:3002 npx tsx scripts/stripe-e2e.ts
 */
import Stripe from "stripe";
import { buildApplication } from "@/test/fixtures";
import { signAll, uniqueOfficerEmails } from "./e2e-helpers";
const BASE = process.env.BASE_URL ?? "http://localhost:3002";
const FAKE = "http://localhost:12111";
const stripe = new Stripe("sk_test_fake");
const secret = "whsec_test_secret";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let cookie = "";
async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) } });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0]!;
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function webhook(type: string, object: unknown, sig?: string) {
  const payload = JSON.stringify({ id: `evt_${Math.random()}`, object: "event", type, data: { object } });
  const header = sig ?? stripe.webhooks.generateTestHeaderString({ payload, secret });
  const res = await fetch(`${BASE}/api/webhooks/stripe`, { method: "POST", body: payload, headers: { "stripe-signature": header } });
  return res.status;
}
async function waitFor(filingId: string, pred: (v: any) => boolean) {
  for (let i = 0; i < 60; i++) {
    const { body } = await api(`/api/filings/${filingId}`);
    if (pred(body)) return body;
    await sleep(1000);
  }
  throw new Error("timeout");
}
const check = (label: string, ok: boolean, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${label} ${extra}`); if (!ok) process.exitCode = 1; };

(async () => {
  // A: one-time payment via webhook
  const a = buildApplication("AU", "AU_PTY_LTD", `Stripe Pay ${Date.now().toString(36)}`);
  a.review.contactEmail = `stripe-a-${Date.now()}@example.com`;
  uniqueOfficerEmails(a, "stripe-a");
  const created = await api("/api/formations", { method: "POST", body: JSON.stringify(a) });
  check("formation returns Stripe checkout URL", created.status === 201 && /checkout\.stripe\.test/.test(created.body.checkoutUrl), created.body.checkoutUrl);
  const f1 = await api(`/api/filings/${created.body.filingId}`);
  check("filing waits for payment", f1.body.status === "DRAFT" && f1.body.payment.status === "PENDING");
  const calls = await (await fetch(`${FAKE}/__calls`)).json();
  const sessionCall = calls.findLast((c: any) => c.path === "/v1/checkout/sessions");
  const items = Object.values(sessionCall.body.line_items) as any[];
  check("session is payment mode with itemised lines", sessionCall.body.mode === "payment" && items.length === 4, items.map((i) => `${i.price_data.product_data.name}=${i.price_data.unit_amount}`).join(", "));
  check("idempotency key sent", !!sessionCall.idempotencyKey);
  const sessionId = created.body.checkoutUrl.split("/").pop();
  check("bad signature rejected", (await webhook("checkout.session.completed", {}, "t=1,v1=bad")) === 400);
  const paid = await (await fetch(`${FAKE}/__pay/${sessionId}`, { method: "POST" })).json();
  check("webhook accepted", (await webhook("checkout.session.completed", paid)) === 200);
  check("duplicate webhook is harmless", (await webhook("checkout.session.completed", paid)) === 200);
  const awaiting = await api(`/api/filings/${created.body.filingId}`);
  check("paid filing waits for signatures", awaiting.body.status === "AWAITING_SIGNATURES" && awaiting.body.signatures.length === 1);
  await signAll(BASE, a);
  const done = await waitFor(created.body.filingId, (v) => v.status === "APPROVED" && v.packReady);
  const events = done.events.map((e: any) => e.status).join(" → ");
  check("paid filing lodged and approved", done.payment.status === "PAID", events);
  check("only one QUEUED transition", done.events.filter((e: any) => e.status === "QUEUED").length === 1);
  check("paid → awaiting signatures → queued", events.startsWith("DRAFT → AWAITING_SIGNATURES"), events);

  // B: subscription via return-URL confirmation, then renewal/cancel webhooks
  cookie = "";
  const b = buildApplication("US_WY", "US_LLC", `Stripe Sub ${Date.now().toString(36)}`);
  b.addons.plan = "COMPLIANCE_ESSENTIALS";
  b.review.contactEmail = `stripe-b-${Date.now()}@example.com`;
  uniqueOfficerEmails(b, "stripe-b");
  const cb = await api("/api/formations", { method: "POST", body: JSON.stringify(b) });
  const sid = cb.body.checkoutUrl.split("/").pop();
  const callsB = await (await fetch(`${FAKE}/__calls`)).json();
  const subCall = callsB.findLast((c: any) => c.path === "/v1/checkout/sessions");
  check("plan purchase uses subscription mode", subCall.body.mode === "subscription");
  const early = await api(`/api/payments/confirm?session_id=${sid}`);
  check("confirm before paying reports unpaid", early.body.paid === false);
  await fetch(`${FAKE}/__pay/${sid}`, { method: "POST" });
  const conf = await api(`/api/payments/confirm?session_id=${sid}`);
  check("confirm after paying settles order", conf.body.paid === true);
  await waitFor(cb.body.filingId, (v) => v.status === "AWAITING_SIGNATURES");
  await signAll(BASE, b);
  await waitFor(cb.body.filingId, (v) => !["DRAFT", "AWAITING_SIGNATURES"].includes(v.status));
  const other = await fetch(`${BASE}/api/payments/confirm?session_id=${sid}`, { headers: { cookie: "gch_session=nope" } });
  check("confirm requires the owner", other.status === 401);
  const subId = `sub_${sid}`;
  check("invoice.paid webhook ok", (await webhook("invoice.paid", { id: "in_2", object: "invoice", parent: { subscription_details: { subscription: subId } } })) === 200);
  check("subscription.deleted webhook ok", (await webhook("customer.subscription.deleted", { id: subId, object: "subscription", cancel_at_period_end: false })) === 200);

  // C: expired session → new checkout
  cookie = "";
  const c = buildApplication("UK", "UK_LTD", `Stripe Exp ${Date.now().toString(36)}`);
  c.review.contactEmail = `stripe-c-${Date.now()}@example.com`;
  const cc = await api("/api/formations", { method: "POST", body: JSON.stringify(c) });
  const sidC = cc.body.checkoutUrl.split("/").pop();
  await webhook("checkout.session.expired", { id: sidC, object: "checkout.session", metadata: { orderId: "x" } });
  const fc = await api(`/api/filings/${cc.body.filingId}`);
  check("still awaiting payment after foreign expiry", fc.body.payment.status === "PENDING");
  const retry = await api(`/api/filings/${cc.body.filingId}/checkout`, { method: "POST" });
  check("retry creates a fresh session", retry.status === 200 && retry.body.checkoutUrl !== cc.body.checkoutUrl, retry.body.checkoutUrl);
})();
