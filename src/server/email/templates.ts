/** Minimal, client-safe HTML email layout with a plain-text twin. */

function escape(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export function layout(opts: { subject: string; heading: string; paragraphs: string[]; action?: { label: string; url: string }; footer?: string }): EmailContent {
  const { subject, heading, paragraphs, action, footer } = opts;
  const text = [heading, "", ...paragraphs, ...(action ? ["", `${action.label}: ${action.url}`] : []), "", footer ?? "— GlobalCorp Hub"].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e2e8f0">
<tr><td style="padding:28px 32px">
<p style="margin:0 0 16px;font-weight:600;color:#1e40af">GlobalCorp Hub</p>
<h1 style="margin:0 0 16px;font-size:20px">${escape(heading)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.55">${escape(p)}</p>`).join("")}
${action ? `<p style="margin:24px 0"><a href="${escape(action.url)}" style="background:#1e40af;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">${escape(action.label)}</a></p><p style="margin:0;font-size:12px;color:#64748b;word-break:break-all">Or paste this link into your browser: ${escape(action.url)}</p>` : ""}
<p style="margin:24px 0 0;font-size:12px;color:#64748b">${escape(footer ?? "You received this because of activity on your GlobalCorp Hub account.")}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
