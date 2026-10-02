import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";
import { findRequestForUser } from "@/server/signatures/service";
import { signingViewModel } from "@/server/signatures/view";
import { SignConsent } from "@/components/sign/sign-consent";
import { InvalidSigningLink } from "@/components/sign/invalid-link";

export const metadata: Metadata = { title: "Sign your consent" };
export const dynamic = "force-dynamic";

/** In-app signing for a signed-in officer whose verified email matches the request. */
export default async function SignInAppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirectTo=/sign/request/${id}`);
  const request = await findRequestForUser(id, user);
  if (!request) return <InvalidSigningLink />;
  return <SignConsent view={await signingViewModel(request)} auth={{ requestId: id }} documentUrl={`/api/sign/document?id=${encodeURIComponent(id)}`} />;
}
