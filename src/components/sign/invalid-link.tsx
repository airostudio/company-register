import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function InvalidSigningLink() {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>This signing link isn&apos;t valid</CardTitle>
        <CardDescription>
          It may have been replaced by a newer link. Check your inbox for the latest email, or ask the person registering the company to resend it.
        </CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
