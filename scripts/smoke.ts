/**
 * End-to-end smoke test against a running server (npm run dev / start):
 * submits a formation per jurisdiction, follows the lodgement until the mock
 * registry approves it, then downloads every generated document.
 *
 *   MOCK_REGISTRY_SPEED=0.2 npm run dev   # in another terminal
 *   npx tsx scripts/smoke.ts [AU|US_DE|US_WY|UK ...]
 */
import type { CreateFormationResponse, FilingView } from "@/lib/api-types";
import type { EntityType, Jurisdiction } from "@/lib/domain";
import { buildApplication } from "@/test/fixtures";
import { signConsent, signingToken, uniqueOfficerEmails } from "./e2e-helpers";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TARGETS: Record<string, [Jurisdiction, EntityType]> = {
  AU: ["AU", "AU_PTY_LTD"],
  US_DE: ["US_DE", "US_C_CORP"],
  US_WY: ["US_WY", "US_LLC"],
  UK: ["UK", "UK_LTD"],
};

async function run(key: string) {
  const [jurisdiction, entityType] = TARGETS[key]!;
  const app = buildApplication(jurisdiction, entityType, `Smoke Test ${Date.now().toString(36)}`);
  app.review.contactEmail = `smoke+${key.toLowerCase()}-${Date.now()}@example.com`;
  uniqueOfficerEmails(app, key.toLowerCase());

  const res = await fetch(`${BASE_URL}/api/formations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(app),
  });
  const body = await res.json();
  if (res.status !== 201) throw new Error(`${key}: POST /api/formations → ${res.status} ${JSON.stringify(body)}`);
  const created = body as CreateFormationResponse;
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  console.log(`${key}: created filing ${created.filingId}, due today ${created.quote.totals.dueToday / 100} ${created.quote.currency}`);

  // Officers e-sign their consents via the emailed links before lodgement starts.
  for (const officer of app.people.officers) {
    const token = await signingToken(BASE_URL, officer.email!);
    const wrong = await signConsent(BASE_URL, token, "Somebody Else");
    if (wrong.status !== 400) throw new Error(`${key}: wrong name was accepted (${wrong.status})`);
    const ok = await signConsent(BASE_URL, token, officer.fullName.toUpperCase());
    if (ok.status !== 200) throw new Error(`${key}: signing failed ${JSON.stringify(ok.body)}`);
    const again = await signConsent(BASE_URL, token, officer.fullName);
    if (again.status !== 409) throw new Error(`${key}: consent signed twice (${again.status})`);
  }
  console.log(`${key}: ${app.people.officers.length} consent(s) e-signed`);

  const seen: string[] = [];
  const deadline = Date.now() + 120_000;
  let view: FilingView;
  for (;;) {
    const r = await fetch(`${BASE_URL}/api/filings/${created.filingId}`, { headers: { cookie } });
    view = (await r.json()) as FilingView;
    if (!r.ok) throw new Error(`${key}: GET filing → ${r.status} ${JSON.stringify(view)}`);
    if (seen.at(-1) !== view.status) seen.push(view.status);
    if (view.settled && (view.status !== "APPROVED" || view.packReady)) break;
    if (Date.now() > deadline) throw new Error(`${key}: timed out in ${view.status}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`${key}: ${seen.join(" → ")} · ${view.company.registryNumber ?? "-"}`);
  if (!view.documents.some((d) => d.source === "SIGNED" && d.type === "CONSENT_TO_ACT")) throw new Error(`${key}: signed consent missing from vault`);
  if (view.documents.some((d) => d.source === "GENERATED" && d.type === "CONSENT_TO_ACT")) throw new Error(`${key}: unsigned consent still generated`);
  if (view.status !== "APPROVED") throw new Error(`${key}: ended in ${view.status}: ${view.error?.message}`);

  for (const doc of view.documents) {
    const d = await fetch(`${BASE_URL}/api/documents/${doc.id}`, { headers: { cookie } });
    const bytes = new Uint8Array(await d.arrayBuffer());
    const isPdf = new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
    if (!d.ok || !isPdf) throw new Error(`${key}: document ${doc.title} failed (${d.status})`);
  }
  console.log(`${key}: ${view.documents.length} documents OK (${view.documents.map((d) => d.title).join("; ")})`);
}

/** Magic-link round trip via the dev mailbox (needs DEV_MAILBOX=1 on the server). */
async function signIn() {
  const email = `smoke-login-${Date.now()}@example.com`;
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, redirectTo: "/dashboard" }),
  });
  if (!res.ok) throw new Error(`login: ${res.status}`);
  const mailbox = await fetch(`${BASE_URL}/api/dev/mailbox?to=${encodeURIComponent(email)}`);
  if (mailbox.status === 404) return console.log("login: skipped (DEV_MAILBOX not enabled)");
  const { messages } = (await mailbox.json()) as { messages: { text: string }[] };
  const link = messages[0]?.text.match(/https?:\/\/\S+\/api\/auth\/verify\?token=\S+/)?.[0];
  if (!link) throw new Error("login: no magic link in mailbox");
  const path = new URL(link).pathname + new URL(link).search;
  const verify = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
  const cookie = verify.headers.get("set-cookie")?.split(";")[0];
  if (verify.status !== 303 || !verify.headers.get("location")?.endsWith("/dashboard") || !cookie) throw new Error(`login: verify → ${verify.status}`);
  const reuse = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
  if (!reuse.headers.get("location")?.includes("error=used")) throw new Error("login: link was reusable");
  const dashboard = await fetch(`${BASE_URL}/dashboard`, { headers: { cookie }, redirect: "manual" });
  if (dashboard.status !== 200) throw new Error(`login: dashboard → ${dashboard.status}`);
  console.log("login: magic link signs in, is single-use, and opens the dashboard");
}

const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TARGETS);
signIn().then(() => Promise.all(keys.map(run))).then(
  () => console.log("Smoke test passed"),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
