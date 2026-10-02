import { db } from "../db";

export type EmailCategory = "login" | "verification" | "signature" | "reminder" | "receipt" | "ops";

export interface EmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  category: EmailCategory;
}

/**
 * Transactional email. Drivers:
 *   resend — https://resend.com (set RESEND_API_KEY + EMAIL_FROM)
 *   log    — print to the server log only (development)
 * Every message is recorded in EmailMessage, which also backs the dev mailbox.
 */
export async function sendEmail(input: EmailInput): Promise<{ id: string; status: "SENT" | "FAILED" }> {
  const driver = process.env.EMAIL_DRIVER ?? (process.env.RESEND_API_KEY ? "resend" : "log");
  let providerId: string | undefined;
  let error: string | undefined;

  try {
    if (driver === "resend") {
      providerId = await sendWithResend(input);
    } else {
      console.info(`[email:${input.category}] to=${input.to} subject="${input.subject}"\n${input.text}`);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error(`[email] failed to send "${input.subject}" to ${input.to}: ${error}`);
  }

  const status = error ? "FAILED" : "SENT";
  const record = await db().emailMessage.create({
    data: {
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      category: input.category,
      provider: driver,
      providerId,
      status,
      error,
    },
  });
  return { id: record.id, status };
}

async function sendWithResend(input: EmailInput): Promise<string> {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM must be set to use the Resend driver");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text, html: input.html }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? "unknown error"}`);
  return body.id;
}

/** The dev mailbox is only exposed when explicitly enabled. */
export function devMailboxEnabled(): boolean {
  return process.env.DEV_MAILBOX === "1";
}
