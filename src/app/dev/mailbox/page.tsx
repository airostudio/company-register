import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { devMailboxEnabled } from "@/server/email";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** Development inbox: every email the app "sent" with EMAIL_DRIVER=log. */
export default async function DevMailboxPage() {
  if (!devMailboxEnabled()) notFound();
  const messages = await db().emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dev mailbox</h1>
      <p className="text-sm text-muted-foreground">Visible because DEV_MAILBOX=1. Never enable this in production.</p>
      {messages.map((m) => (
        <Card key={m.id} className="gap-3">
          <CardHeader>
            <CardTitle className="text-base">{m.subject}</CardTitle>
            <CardDescription>
              To {m.to} · {formatDate(m.createdAt, { dateStyle: "medium", timeStyle: "medium" })} <Badge variant="secondary">{m.category}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap">
              {m.text.split(/(https?:\/\/\S+)/g).map((part, i) =>
                /^https?:\/\//.test(part) ? (
                  <a key={i} href={part} className="break-all text-primary underline">
                    {part}
                  </a>
                ) : (
                  part
                ),
              )}
            </pre>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
