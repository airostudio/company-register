import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Currency, MinorUnits } from "@/lib/domain";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LOCALE_BY_CURRENCY: Record<Currency, string> = {
  AUD: "en-AU",
  USD: "en-US",
  GBP: "en-GB",
};

export function formatMoney(amount: MinorUnits, currency: Currency): string {
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
  }).format(amount / 100);
}

/** Per-share prices in major units, keeping sub-cent par values like $0.0001. */
export function formatUnitPrice(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount);
}

export function formatDate(value: Date | string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", opts).format(date);
}

export function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`;
}

/** Collision-resistant client-side id for repeater rows. */
export function createId(prefix = "id"): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}
