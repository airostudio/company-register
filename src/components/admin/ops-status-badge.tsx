import type { OpsTaskStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const STYLES: Record<OpsTaskStatus, { label: string; variant: "secondary" | "default" | "warning" | "success" | "destructive" }> = {
  OPEN: { label: "Open", variant: "default" },
  IN_PROGRESS: { label: "In progress", variant: "secondary" },
  SUBMITTED: { label: "Lodged — awaiting authority", variant: "secondary" },
  ACTION_REQUIRED: { label: "Action required", variant: "warning" },
  COMPLETED: { label: "Completed", variant: "success" },
  REJECTED: { label: "Rejected", variant: "destructive" },
};

export function OpsStatusBadge({ status }: { status: OpsTaskStatus }) {
  return <Badge variant={STYLES[status].variant}>{STYLES[status].label}</Badge>;
}
