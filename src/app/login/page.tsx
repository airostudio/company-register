import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";
import { safeRedirect } from "@/server/urls";
import { devMailboxEnabled } from "@/server/email";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  expired: "That sign-in link has expired. Request a new one below.",
  used: "That sign-in link has already been used. Request a new one below.",
  invalid: "That sign-in link isn't valid. Request a new one below.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const redirectTo = safeRedirect(params.redirectTo);
  if (await getCurrentUser()) redirect(redirectTo);
  return (
    <LoginForm
      defaultEmail={params.email ?? ""}
      redirectTo={redirectTo}
      error={params.error ? ERRORS[params.error] : undefined}
      devMailbox={devMailboxEnabled()}
    />
  );
}
