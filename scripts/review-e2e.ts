/**
 * Legal template review e2e: documents are drafts until a lawyer's approval is
 * recorded for the template's exact wording. Needs DEV_MAILBOX=1 and
 * ADMIN_EMAILS=ops@example.com on the server.   npx tsx scripts/review-e2e.ts
 */
import { buildApplication } from "@/test/fixtures";
import { signAll, uniqueOfficerEmails } from "./e2e-helpers";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label} ${extra}`);
  if (!ok) process.exitCode = 1;
};

async function formUk(tag: string) {
  const app = buildApplication("UK", "UK_LTD", `Review ${tag} ${Date.now().toString(36)}`);
  app.review.contactEmail = `review-${tag}-${Date.now()}@example.com`;
  uniqueOfficerEmails(app, `rv${tag}`);
  const res = await fetch(`${BASE}/api/formations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(app) });
  const created = await res.json();
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  await signAll(BASE, app);
  let view: { packReady: boolean; documents: { type: string; source: string; templateReviewed: boolean | null }[] } | undefined;
  for (let i = 0; i < 40 && !view?.packReady; i++) {
    view = await (await fetch(`${BASE}/api/filings/${created.filingId}`, { headers: { cookie } })).json();
    if (!view?.packReady) await sleep(1000);
  }
  return view!;
}

async function opsCookie() {
  await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "ops@example.com" }) });
  const { messages } = await (await fetch(`${BASE}/api/dev/mailbox?to=ops@example.com`)).json();
  const link = new URL(messages[0].text.match(/https?:\/\/\S+\/api\/auth\/verify\?token=\S+/)[0]);
  const res = await fetch(`${BASE}${link.pathname}${link.search}`, { redirect: "manual" });
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

const articles = (v: Awaited<ReturnType<typeof formUk>>) => v.documents.find((d) => d.type === "ARTICLES_OF_ASSOCIATION")!;

(async () => {
  const ops = await opsCookie();
  const html = (await (await fetch(`${BASE}/admin/templates`, { headers: { cookie: ops } })).text()).replace(/<!-- -->/g, "");
  check("templates page lists the catalog", html.includes("UK_ARTICLES"));
  const fingerprint = html.match(/UK_ARTICLES · v[\d.]+ · fingerprint ([0-9a-f]{16})/)?.[1];
  check("fingerprint shown", !!fingerprint, fingerprint);
  const alreadyApproved = html.match(/id="UK_ARTICLES"[\s\S]*?(Approved|Not reviewed|Changes requested|Wording changed)/)?.[1] === "Approved";

  if (!alreadyApproved) {
    const before = await formUk("a");
    check("unreviewed articles are drafts", articles(before).templateReviewed === false);
  }
  const preview = await fetch(`${BASE}/api/admin/templates/UK_ARTICLES/preview`, { headers: { cookie: ops } });
  check("preview PDF", preview.status === 200 && Buffer.from(await preview.arrayBuffer()).subarray(0, 5).toString() === "%PDF-");

  const form = (overrides: Record<string, string | undefined>) => {
    const fields: Record<string, string | undefined> = {
      fingerprint,
      status: "APPROVED",
      reviewerName: "Pat Counsel",
      reviewerFirm: "Example LLP",
      reviewerAdmission: "Solicitor, England & Wales — SRA 000000",
      reviewedAt: "2026-10-02",
      confirm: "on",
      ...overrides,
    };
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) f.append(k, v);
    return f;
  };
  const post = async (f: FormData) =>
    decodeURIComponent((await fetch(`${BASE}/api/admin/templates/UK_ARTICLES/review`, { method: "POST", body: f, headers: { cookie: ops }, redirect: "manual" })).headers.get("location") ?? "");
  check("stale fingerprint refused", (await post(form({ fingerprint: "0000000000000000" }))).includes("wording changed"));
  check("written-advice confirmation required", (await post(form({ confirm: undefined }))).includes("error="));
  check("approval recorded", (await post(form({}))).includes("ok=UK_ARTICLES"));

  const after = await formUk("b");
  check("approved articles are no longer drafts", articles(after).templateReviewed === true);
  check("other templates stay drafts", after.documents.some((d) => d.type === "SHARE_CERTIFICATE" && d.templateReviewed === false));
})();
