import type { User } from "@prisma/client";
import { db } from "./db";
import { sendEmail } from "./email";
import { layout } from "./email/templates";
import { hashToken, newToken } from "./session";

const LINK_TTL_MS = 15 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function adminEmails(): Set<string> {
  return new Set((process.env.ADMIN_EMAILS ?? "").split(",").map(normalizeEmail).filter(Boolean));
}

/**
 * Email a one-time sign-in link. Always succeeds from the caller's point of
 * view, so the endpoint can't be used to discover which emails have accounts.
 */
export async function sendLoginLink(opts: {
  email: string;
  redirectTo: string;
  baseUrl: string;
  purpose?: "login" | "verification";
}): Promise<void> {
  const email = normalizeEmail(opts.email);
  const token = newToken();
  await db().loginToken.create({
    data: { email, tokenHash: hashToken(token), redirectTo: opts.redirectTo, expiresAt: new Date(Date.now() + LINK_TTL_MS) },
  });
  const url = `${opts.baseUrl}/api/auth/verify?token=${token}`;
  const content =
    opts.purpose === "verification"
      ? layout({
          subject: "Confirm your email for GlobalCorp Hub",
          heading: "Confirm your email",
          paragraphs: [
            "Thanks for registering your company with GlobalCorp Hub. Confirm this is your email address so we can send you documents and compliance reminders.",
            "The link works for 15 minutes. You can request a new one from the sign-in page at any time.",
          ],
          action: { label: "Confirm email", url },
        })
      : layout({
          subject: "Your GlobalCorp Hub sign-in link",
          heading: "Sign in to GlobalCorp Hub",
          paragraphs: ["Click the button below to sign in. The link works once and expires in 15 minutes.", "If you didn't ask to sign in, you can ignore this email."],
          action: { label: "Sign in", url },
        });
  await sendEmail({ to: email, ...content, category: opts.purpose ?? "login" });
}

export type ConsumeResult = { ok: true; user: User; redirectTo: string } | { ok: false; reason: "invalid" | "expired" | "used" };

/** Redeem a magic-link token: marks the email verified and returns the user (creating them on first sign-in). */
export async function consumeLoginToken(token: string): Promise<ConsumeResult> {
  const prisma = db();
  const record = await prisma.loginToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record) return { ok: false, reason: "invalid" };
  if (record.usedAt) return { ok: false, reason: "used" };
  if (record.expiresAt < new Date()) return { ok: false, reason: "expired" };

  // Compare-and-set so a link can only ever be used once, even with concurrent clicks.
  const { count } = await prisma.loginToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (count === 0) return { ok: false, reason: "used" };

  const isAdmin = adminEmails().has(record.email);
  const user = await prisma.user.upsert({
    where: { email: record.email },
    create: { email: record.email, emailVerifiedAt: new Date(), role: isAdmin ? "ADMIN" : "CUSTOMER" },
    update: { emailVerifiedAt: new Date(), ...(isAdmin ? { role: "ADMIN" as const } : {}) },
  });
  return { ok: true, user, redirectTo: record.redirectTo ?? "/dashboard" };
}
