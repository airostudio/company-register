import type { Metadata } from "next";
import Link from "next/link";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/server/session";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GlobalCorp Hub — Register your company anywhere", template: "%s · GlobalCorp Hub" },
  description: "Form an Australian Pty Ltd, US LLC or C-Corp, or UK Ltd in minutes with transparent government fees.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <header className="border-b bg-card/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Globe className="size-5 text-primary" /> GlobalCorp Hub
            </Link>
            <nav className="flex items-center gap-1">
              {user?.role === "ADMIN" && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin">Ops</Link>
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              {user ? (
                <form action="/api/auth/logout" method="post" className="flex items-center gap-1">
                  <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
                  <Button type="submit" variant="ghost" size="sm">
                    Sign out
                  </Button>
                </form>
              ) : (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Sign in</Link>
                </Button>
              )}
              <Button asChild size="sm">
                <Link href="/register">Start a company</Link>
              </Button>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
