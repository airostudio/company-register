/** Shared helpers for the e2e scripts (need DEV_MAILBOX=1 on the server). */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait for the consent email sent to `email` and return the signing token. */
export async function signingToken(base: string, email: string, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/api/dev/mailbox?to=${encodeURIComponent(email)}`);
    if (res.status === 404) throw new Error("DEV_MAILBOX is not enabled on the server");
    const { messages } = (await res.json()) as { messages: { subject: string; text: string }[] };
    const token = messages.find((m) => m.subject.startsWith("Please sign"))?.text.match(/\/sign\/([A-Za-z0-9_-]+)/)?.[1];
    if (token) return token;
    await sleep(500);
  }
  throw new Error(`No consent email for ${email}`);
}

export async function signConsent(base: string, token: string, typedName: string) {
  const res = await fetch(`${base}/api/sign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, action: "sign", typedName, agree: true }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Give every officer a unique inbox so their consent emails can be found. */
export function uniqueOfficerEmails<T extends { people: { officers: { email?: string }[] } }>(app: T, tag: string): string[] {
  return app.people.officers.map((o, i) => (o.email = `officer${i}-${tag}-${Date.now().toString(36)}@example.com`));
}

/** Sign every officer's consent through the emailed links. */
export async function signAll(base: string, app: { people: { officers: { email?: string; fullName: string }[] } }) {
  for (const officer of app.people.officers) {
    const token = await signingToken(base, officer.email!);
    const result = await signConsent(base, token, officer.fullName);
    if (result.status !== 200) throw new Error(`Signing failed for ${officer.fullName}: ${JSON.stringify(result.body)}`);
  }
}
