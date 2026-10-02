// Minimal fake of the Stripe endpoints this app calls, for local e2e tests without Stripe keys.
// Run: node scripts/fake-stripe.mjs  (listens on :12111), then start the app with
// STRIPE_SECRET_KEY=sk_test_fake STRIPE_WEBHOOK_SECRET=whsec_test_secret STRIPE_API_HOST=localhost STRIPE_API_PORT=12111 STRIPE_API_PROTOCOL=http
import http from "node:http";
const sessions = new Map();
const calls = [];
let n = 0;
function parseForm(body) {
  const out = {};
  for (const [k, v] of new URLSearchParams(body)) {
    const path = k.replace(/\]/g, "").split("[");
    let cur = out;
    path.forEach((p, i) => {
      if (i === path.length - 1) cur[p] = v;
      else cur = cur[p] ??= {};
    });
  }
  return out;
}
const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    calls.push({ method: req.method, path: url.pathname, idempotencyKey: req.headers["idempotency-key"], body: body ? parseForm(body) : undefined });
    if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
      const p = parseForm(body);
      const id = `cs_test_${Date.now().toString(36)}${++n}`;
      const s = { id, object: "checkout.session", mode: p.mode, url: `https://checkout.stripe.test/pay/${id}`, metadata: p.metadata, client_reference_id: p.client_reference_id,
        payment_status: "unpaid", status: "open", customer: null, payment_intent: null, subscription: null, invoice: null, line_items_in: p.line_items };
      sessions.set(id, s);
      return json(res, 200, s);
    }
    let m;
    if (req.method === "GET" && (m = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/))) {
      const s = sessions.get(m[1]);
      return s ? json(res, 200, s) : json(res, 404, { error: { type: "invalid_request_error", message: "No such session" } });
    }
    if (req.method === "POST" && (m = url.pathname.match(/^\/__pay\/(.+)$/))) {
      const s = sessions.get(m[1]);
      Object.assign(s, { payment_status: "paid", status: "complete", customer: `cus_${s.id}` }, s.mode === "subscription" ? { subscription: `sub_${s.id}`, invoice: `in_${s.id}` } : { payment_intent: `pi_${s.id}` });
      return json(res, 200, s);
    }
    if (req.method === "GET" && (m = url.pathname.match(/^\/v1\/subscriptions\/(.+)$/))) {
      const now = Math.floor(Date.now() / 1000);
      return json(res, 200, { id: m[1], object: "subscription", items: { object: "list", data: [{ id: "si_1", current_period_start: now, current_period_end: now + 2 * 365 * 86400 }] } });
    }
    if (req.method === "POST" && url.pathname === "/v1/billing_portal/sessions") return json(res, 200, { id: "bps_1", url: "https://billing.stripe.test/p/1" });
    if (url.pathname === "/__calls") return json(res, 200, calls);
    json(res, 404, { error: { type: "invalid_request_error", message: `fake: ${req.method} ${url.pathname}` } });
  });
}).listen(12111, () => console.log("fake stripe on 12111"));
