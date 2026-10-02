import type { Metadata } from "next";
import { findRequestByToken } from "@/server/signatures/service";
import { signingViewModel } from "@/server/signatures/view";
import { SignConsent } from "@/components/sign/sign-consent";
import { InvalidSigningLink } from "@/components/sign/invalid-link";

export const metadata: Metadata = { title: "Sign your consent", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SignByTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const request = await findRequestByToken(token);
  if (!request) return <InvalidSigningLink />;
  return <SignConsent view={await signingViewModel(request)} auth={{ token }} documentUrl={`/api/sign/document?token=${encodeURIComponent(token)}`} />;
}
