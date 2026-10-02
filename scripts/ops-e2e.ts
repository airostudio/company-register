/**
 * Assisted lodgement e2e: run against a server started with REGISTRY_MODE=live, DEV_MAILBOX=1 and
 * ADMIN_EMAILS=ops@example.com.   npx tsx scripts/ops-e2e.ts
 */
import { renderRegistryCertificate } from "@/lib/documents";
import { buildApplication } from "@/test/fixtures";
import { signAll, uniqueOfficerEmails } from "./e2e-helpers";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const check = (label: string, ok: boolean, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${label} ${extra}`); if (!ok) process.exitCode = 1; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function magicLogin(email: string): Promise<string> {
  await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, redirectTo: "/admin" }) });
  const { messages } = await (await fetch(`${BASE}/api/dev/mailbox?to=${encodeURIComponent(email)}`)).json();
  const link = messages[0].text.match(/https?:\/\/\S+\/api\/auth\/verify\?token=\S+/)[0];
  const res = await fetch(`${BASE}${new URL(link).pathname}${new URL(link).search}`, { redirect: "manual" });
  return res.headers.get("set-cookie")!.split(";")[0]!;
}
async function filing(cookie: string, id: string) {
  return (await fetch(`${BASE}/api/filings/${id}`, { headers: { cookie } })).json();
}
async function act(cookie: string, taskId: string, fields: Record<string, string | Blob>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${BASE}/api/admin/tasks/${taskId}`, { method: "POST", body: form, headers: { cookie }, redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") ?? "" };
}

(async () => {
  const name = `Assisted Test ${Date.now().toString(36)}`;
  const nc = await (await fetch(`${BASE}/api/names/check?name=${encodeURIComponent(name + " Pty Ltd")}&jurisdiction=AU`)).json();
  check("live AU name check flags unverified register", nc.result.available && nc.result.issues.some((i: any) => i.code === "UNVERIFIED"));

  const app = buildApplication("AU", "AU_PTY_LTD", name);
  app.review.contactEmail = `assisted-${Date.now()}@example.com`;
  uniqueOfficerEmails(app, "ops");
  const res = await fetch(`${BASE}/api/formations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(app) });
  const created = await res.json();
  const customer = res.headers.get("set-cookie")!.split(";")[0]!;
  await signAll(BASE, app);
  let view: any;
  for (let i = 0; i < 20 && view?.status !== "SUBMITTED"; i++) { await sleep(1000); view = await filing(customer, created.filingId); }
  check("filing queued with ops", view.status === "SUBMITTED" && view.registryReference?.startsWith("OPS-ASIC-"), view.registryReference);

  const ops = await magicLogin("ops@example.com");
  const adminPage = await fetch(`${BASE}/admin`, { headers: { cookie: ops } });
  const html = await adminPage.text();
  check("ops console lists the task", adminPage.status === 200 && html.includes(view.registryReference));
  const customerAdmin = await fetch(`${BASE}/admin`, { headers: { cookie: customer } });
  check("customers can't see the ops console", customerAdmin.status === 404);
  const taskId = html.match(new RegExp(`/admin/tasks/([a-z0-9]+)"[^>]*>(?:(?!</a>).)*${view.registryReference}`, "s"))?.[1] ?? html.match(/\/admin\/tasks\/([a-z0-9]+)/)![1]!;
  const pack = await fetch(`${BASE}/api/admin/tasks/${taskId}/pack`, { headers: { cookie: ops } });
  check("lodgement pack PDF", pack.status === 200 && Buffer.from(await pack.arrayBuffer()).subarray(0, 5).toString() === "%PDF-");
  const forbidden = await act(customer, taskId, { action: "claim" });
  check("customers can't act on tasks", forbidden.status === 403);

  check("claim", (await act(ops, taskId, { action: "claim" })).location.includes("ok=1"));
  check("lodged", (await act(ops, taskId, { action: "lodged", externalReference: "7E1234567" })).location.includes("ok=1"));
  view = await filing(customer, created.filingId);
  check("customer sees under review", view.status === "UNDER_REVIEW", view.events.at(-1).message);

  check("requisition", (await act(ops, taskId, { action: "action_required", message: "ASIC needs proof the director's ID is current." })).location.includes("ok=1"));
  view = await filing(customer, created.filingId);
  check("customer sees action required", view.status === "REQUIRES_ACTION" && view.error.message.includes("proof"));
  const bad = await act(ops, taskId, { action: "approve", resultNumber: "123", resultDate: "2026-10-02" });
  check("invalid transition refused", bad.location.includes("error="), decodeURIComponent(bad.location.split("error=")[1] ?? ""));
  check("resume", (await act(ops, taskId, { action: "resume" })).location.includes("ok=1"));
  view = await filing(customer, created.filingId);
  check("customer back to under review", view.status === "UNDER_REVIEW");

  const noCert = await act(ops, taskId, { action: "approve", resultNumber: "650 000 017", resultDate: "2026-10-02" });
  check("approval needs a certificate", decodeURIComponent(noCert.location).includes("Upload the registry's certificate"));
  const notPdf = await act(ops, taskId, { action: "approve", resultNumber: "650 000 017", resultDate: "2026-10-02", certificate: new File(["hello"], "c.pdf", { type: "application/pdf" }) });
  check("non-PDF upload refused", decodeURIComponent(notPdf.location).includes("must be a PDF"));
  const cert = await renderRegistryCertificate({ registryName: "ASIC", statute: "the Corporations Act 2001", companyName: `${name} Pty Ltd`, numberLabel: "ACN", registryNumber: "650 000 017", entityLabel: "Proprietary company", jurisdictionName: "NSW", incorporatedAt: "2026-10-02", filingReference: "x" });
  const ok = await act(ops, taskId, { action: "approve", resultNumber: "650 000 017", resultDate: "2026-10-02", certificate: new File([Buffer.from(cert)], "asic-cert.pdf", { type: "application/pdf" }) });
  check("approve with certificate", ok.location.includes("ok=1"));
  view = await filing(customer, created.filingId);
  check("customer filing approved", view.status === "APPROVED" && view.company.registryNumber === "650 000 017");
  check("uploaded certificate in the vault", view.documents.some((d: any) => d.source === "REGISTRY" && d.type === "CERTIFICATE_OF_INCORPORATION"), view.documents.map((d: any) => d.title).join("; "));
  // Tax ID add-on → a TAX_REGISTRATION task for the ABR.
  let taxTaskId: string | undefined;
  for (let i = 0; i < 20 && !taxTaskId; i++) {
    await fetch(`${BASE}/dashboard`, { headers: { cookie: customer } }); // inline runner advances on view
    const list = await (await fetch(`${BASE}/admin?view=open&kind=TAX_REGISTRATION`, { headers: { cookie: ops } })).text();
    taxTaskId = list.includes(name) ? list.match(new RegExp(`/admin/tasks/([a-z0-9]+)"(?:(?!</a>).)*${name}`, "s"))?.[1] : undefined;
    if (!taxTaskId) await sleep(1000);
  }
  check("tax registration task created", !!taxTaskId);
  const worksheet = await fetch(`${BASE}/api/admin/tasks/${taxTaskId}/pack`, { headers: { cookie: ops } });
  check("prefilled tax worksheet PDF", worksheet.status === 200 && Buffer.from(await worksheet.arrayBuffer()).subarray(0, 5).toString() === "%PDF-");
  check("tax: lodged", (await act(ops, taxTaskId!, { action: "lodged", externalReference: "ABR-REF-1" })).location.includes("ok=1"));
  check("tax: issued", (await act(ops, taxTaskId!, { action: "approve", resultNumber: "51 824 753 556", resultDate: "2026-10-03" })).location.includes("ok=1"));
  const dash = await (await fetch(`${BASE}/dashboard`, { headers: { cookie: customer } })).text();
  check("customer sees ABN", dash.includes("51 824 753 556") && dash.includes("ABN confirmation"));

  const mails = (await (await fetch(`${BASE}/api/dev/mailbox?to=${encodeURIComponent(app.review.contactEmail)}`)).json()).messages.map((m: any) => m.subject);
  check("customer emailed about requisition and approval", mails.some((s: string) => s.startsWith("Action needed")) && mails.some((s: string) => s.includes("is registered")), mails.join(" | "));
})();
