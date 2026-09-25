"use client";

import { Landmark, Receipt } from "lucide-react";
import type { Quote } from "@/lib/pricing/quote";
import { cn, formatMoney } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const GROUPS = [
  { category: "GOVERNMENT", label: "Government fees", hint: "Paid to the registry at cost" },
  { category: "SERVICE", label: "Platform service", hint: undefined },
  { category: "ADDON", label: "Add-ons", hint: undefined },
  { category: "SUBSCRIPTION", label: "Compliance plan", hint: undefined },
  { category: "TAX", label: "Tax", hint: undefined },
] as const;

/** Transparent breakdown: government filing fees are always shown separately from our fees. */
export function PriceSummary({ quote, compact }: { quote: Quote; compact?: boolean }) {
  return (
    <div className="space-y-3 text-sm">
      {GROUPS.map(({ category, label, hint }) => {
        const items = quote.lineItems.filter((i) => i.category === category);
        if (!items.length) return null;
        return (
          <div key={category} className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {category === "GOVERNMENT" ? <Landmark className="size-3.5" /> : <Receipt className="size-3.5" />}
              {label}
            </div>
            {items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn("leading-snug", compact && "text-xs")}>
                    {item.label}
                    {item.recurring && <span className="text-muted-foreground"> / yr</span>}
                  </p>
                  {!compact && (item.note || hint) && <p className="text-xs text-muted-foreground">{item.note ?? hint}</p>}
                </div>
                <span className="shrink-0 tabular-nums">
                  {item.listAmount !== undefined && item.amount < item.listAmount && (
                    <span className="mr-1.5 text-xs text-muted-foreground line-through">{formatMoney(item.listAmount, quote.currency)}</span>
                  )}
                  {item.amount === 0 ? "Included" : formatMoney(item.amount, quote.currency)}
                </span>
              </div>
            ))}
          </div>
        );
      })}
      <Separator />
      <div className="flex items-baseline justify-between font-semibold">
        <span>Due today</span>
        <span className="text-lg tabular-nums">{formatMoney(quote.totals.dueToday, quote.currency)}</span>
      </div>
      {quote.totals.renewsAnnually > 0 && (
        <p className="text-xs text-muted-foreground">
          Renews at {formatMoney(quote.totals.renewsAnnually, quote.currency)}/yr{quote.taxLabel ? ` + ${quote.taxLabel}` : ""}. Cancel anytime.
        </p>
      )}
    </div>
  );
}
