import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Minimal signed-cookie session so the checkout → dashboard flow works end to
 * end. Replace with a real identity provider (Auth.js, Clerk, WorkOS) with
 * email verification before production.
 */

const COOKIE = "gch_session";
const MAX_AGE = 60 * 60 * 24 * 30;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return "dev-only-insecure-session-secret";
}

function sign(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("base64url");
}

export function encodeSession(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function decodeSession(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const userId = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(userId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : undefined;
}

export async function getSessionUserId(): Promise<string | undefined> {
  return decodeSession((await cookies()).get(COOKIE)?.value);
}

export async function setSessionUser(userId: string): Promise<void> {
  (await cookies()).set(COOKIE, encodeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}
