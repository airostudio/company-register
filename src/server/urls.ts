/** Absolute base URL for links in emails and payment redirects. */
export function appUrl(request?: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (request) return new URL(request.url).origin;
  return "http://localhost:3000";
}

/** Only allow same-site relative redirects ("/dashboard"), never "//evil.com" or absolute URLs. */
export function safeRedirect(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
