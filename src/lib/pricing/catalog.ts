import type { Country, Currency, Jurisdiction, MinorUnits, SubscriptionPlan } from "@/lib/domain";

export const ADD_ON_IDS = [
  "TAX_ID",
  "EXPEDITED",
  "REGISTERED_AGENT",
  "VIRTUAL_OFFICE",
  "FOREIGN_FOUNDER",
  "BUSINESS_PERMITS",
  "BANKING_PARTNER",
] as const;
export type AddOnId = (typeof ADD_ON_IDS)[number];

type Localized = string | ({ default: string } & Partial<Record<Country, string>>);

export interface AddOnDefinition {
  id: AddOnId;
  name: Localized;
  description: Localized;
  category: "tax" | "speed" | "address" | "compliance" | "banking" | "international";
  /** Jurisdictions where the add-on can be purchased. */
  availableIn: readonly Jurisdiction[];
  price: Record<Currency, MinorUnits>;
  recurring?: "year";
  recommended?: boolean;
  /**
   * "address-service" add-ons are selected from the Company Details step
   * rather than toggled freely in the Add-ons step.
   */
  managedBy?: "address-service";
}

const ALL: readonly Jurisdiction[] = ["AU", "US_DE", "US_WY", "UK"];
const US: readonly Jurisdiction[] = ["US_DE", "US_WY"];

export const ADD_ONS: Record<AddOnId, AddOnDefinition> = {
  TAX_ID: {
    id: "TAX_ID",
    name: {
      default: "Tax ID registration",
      AU: "ABN, TFN & GST registration",
      US: "EIN (Tax ID) application",
      UK: "Corporation Tax & PAYE registration",
    },
    description: {
      default: "We register your company with the tax authority as soon as it's incorporated.",
      AU: "We apply to the ABR for your ABN and TFN and optionally register you for GST.",
      US: "We file Form SS-4 with the IRS — no SSN required for non-US founders.",
      UK: "We register the company with HMRC for Corporation Tax and, if you'll pay staff, PAYE.",
    },
    category: "tax",
    availableIn: ALL,
    price: { AUD: 79_00, USD: 79_00, GBP: 39_00 },
    recommended: true,
  },
  EXPEDITED: {
    id: "EXPEDITED",
    name: "Expedited processing",
    description:
      "Your filing jumps to the front of our queue and, where the registry offers it, we pay for priority government handling.",
    category: "speed",
    availableIn: ALL,
    price: { AUD: 99_00, USD: 79_00, GBP: 49_00 },
  },
  REGISTERED_AGENT: {
    id: "REGISTERED_AGENT",
    name: "Registered agent (first year)",
    description:
      "A registered agent in your state of formation to receive legal and state mail, with same-day scans to your dashboard.",
    category: "address",
    availableIn: US,
    price: { AUD: 0, USD: 125_00, GBP: 0 },
    recurring: "year",
    managedBy: "address-service",
  },
  VIRTUAL_OFFICE: {
    id: "VIRTUAL_OFFICE",
    name: {
      default: "Registered office address",
      US: "Virtual business address & mail scanning",
    },
    description: {
      default: "Use our address as your registered office so your home address stays off the public register.",
      US: "A professional street address for your principal office, with mail scanning.",
    },
    category: "address",
    availableIn: ALL,
    price: { AUD: 199_00, USD: 99_00, GBP: 39_00 },
    recurring: "year",
    managedBy: "address-service",
  },
  FOREIGN_FOUNDER: {
    id: "FOREIGN_FOUNDER",
    name: "Non-resident founder package",
    description:
      "ITIN-free EIN filing by fax, Form 5472 reminders, and introductions to banks that onboard non-US founders remotely.",
    category: "international",
    availableIn: US,
    price: { AUD: 0, USD: 149_00, GBP: 0 },
  },
  BUSINESS_PERMITS: {
    id: "BUSINESS_PERMITS",
    name: "Business licenses & permits research",
    description: "A report of the federal, state and local licenses your business activity needs.",
    category: "compliance",
    availableIn: US,
    price: { AUD: 0, USD: 99_00, GBP: 0 },
  },
  BANKING_PARTNER: {
    id: "BANKING_PARTNER",
    name: "Business bank account introduction",
    description: "Share your new company details with a partner bank to open an account in minutes. Free.",
    category: "banking",
    availableIn: ALL,
    price: { AUD: 0, USD: 0, GBP: 0 },
  },
};

export interface PlanDefinition {
  id: SubscriptionPlan;
  name: string;
  tagline: string;
  features: string[];
  /** Annual price; 0 for pay-as-you-go. */
  price: Record<Currency, MinorUnits>;
  includes: AddOnId[];
  recommended?: boolean;
}

export const PLANS: Record<SubscriptionPlan, PlanDefinition> = {
  PAY_AS_YOU_GO: {
    id: "PAY_AS_YOU_GO",
    name: "Pay as you go",
    tagline: "Formation only. Pay for annual filings when they come up.",
    features: ["Company formation & document pack", "Digital document vault", "Email renewal reminders"],
    price: { AUD: 0, USD: 0, GBP: 0 },
    includes: [],
  },
  COMPLIANCE_ESSENTIALS: {
    id: "COMPLIANCE_ESSENTIALS",
    name: "Compliance Essentials",
    tagline: "We prepare and lodge your annual registry filings for you.",
    features: [
      "Everything in Pay as you go",
      "Annual review / report / confirmation statement lodged for you",
      "Compliance calendar with SMS alerts",
      "Officer & address changes included",
    ],
    price: { AUD: 249_00, USD: 199_00, GBP: 99_00 },
    includes: [],
    recommended: true,
  },
  COMPLIANCE_PRO: {
    id: "COMPLIANCE_PRO",
    name: "Compliance Pro",
    tagline: "Hands-off compliance including your address service and tax registration.",
    features: [
      "Everything in Essentials",
      "Registered agent / registered office included",
      "Tax ID registration included",
      "Priority support",
    ],
    price: { AUD: 449_00, USD: 349_00, GBP: 199_00 },
    includes: ["REGISTERED_AGENT", "VIRTUAL_OFFICE", "TAX_ID"],
  },
};

/** Platform fee for the formation itself, which includes the document pack. */
export const FORMATION_SERVICE_FEE: Record<Currency, MinorUnits> = {
  AUD: 149_00,
  USD: 99_00,
  GBP: 49_00,
};

export function localize(value: Localized, country: Country): string {
  return typeof value === "string" ? value : (value[country] ?? value.default);
}

export function isAddOnAvailable(id: AddOnId, jurisdiction: Jurisdiction): boolean {
  return ADD_ONS[id].availableIn.includes(jurisdiction);
}

export function addOnsFor(jurisdiction: Jurisdiction): AddOnDefinition[] {
  return Object.values(ADD_ONS).filter((a) => a.availableIn.includes(jurisdiction));
}
