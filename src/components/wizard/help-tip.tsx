"use client";

import { HelpCircle } from "lucide-react";
import type { Jurisdiction } from "@/lib/domain";
import { getJurisdiction, type HelpTopic } from "@/lib/jurisdictions";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Inline "?" that explains a legal requirement, e.g. "Why do I need a physical address?". */
export function HelpTip({ topic, jurisdiction, help }: { topic?: string; jurisdiction?: Jurisdiction; help?: HelpTopic }) {
  const content = help ?? (topic && jurisdiction ? getJurisdiction(jurisdiction).help[topic] : undefined);
  if (!content) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-normal text-primary hover:underline"
          aria-label={content.title}
        >
          <HelpCircle className="size-3.5" />
          <span className="sr-only sm:not-sr-only">{content.title}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        <p className="mb-1 font-semibold">{content.title}</p>
        <p>{content.body}</p>
      </TooltipContent>
    </Tooltip>
  );
}
