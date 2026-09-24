import type { Currency, EntityType, Jurisdiction, MinorUnits, SubscriptionPlan } from "@/lib/domain";
import { getEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import {
  ADD_ONS,
  FORMATION_SERVICE_FEE,
  PLANS,
  type AddOnId,
  isAddOnAvailable,
  localize,
} from "./catalog";

export type LineItemCategory = "GOVERNMENT" | "SERVICE" | "ADDON" | "SUBSCRIPTION" | "TAX";

export interface QuoteLineItem {
  id: string;
  label: string;
  category: LineItemCategory;
  amount: MinorUnits;
  /** Amount that would have applied without a plan discount (for "included" display). */
  listAmount?: MinorUnits;
  recurring?: "year";
  note?: string;
  taxable: boolean;
}

export interface Quote {
  currency: Currency;
  lineItems: QuoteLineItem[];
  totals: {
    government: MinorUnits;
    service: MinorUnits;
    addOns: MinorUnits;
    subscription: MinorUnits;
    tax: MinorUnits;
    /** Everything charged today. */
    dueToday: MinorUnits;
    /** What renews in 12 months (plan + recurring add-ons, before tax). */
    renewsAnnually: MinorUnits;
  };
  taxLabel?: string;
}

export interface QuoteInput {
  jurisdiction: Jurisdiction;
  entityType: EntityType;
  addOns: readonly AddOnId[];
  plan: SubscriptionPlan;
  /** Customer uses our registered agent (US) / registered office (AU, UK) instead of their own address. */
  useAddressService: boolean;
}

/**
 * Add-ons the customer ends up with once the Company Details choice and
 * availability rules are applied. Address services are driven only by the
 * details step so the two can't disagree.
 */
export function resolveAddOns(input: QuoteInput): AddOnId[] {
  const profile = getJurisdiction(input.jurisdiction);
  const selected = new Set(
    input.addOns.filter((id) => ADD_ONS[id].managedBy !== "address-service" && isAddOnAvailable(id, input.jurisdiction)),
  );
  if (input.useAddressService) {
    selected.add(profile.address.registeredAgent === "required" ? "REGISTERED_AGENT" : "VIRTUAL_OFFICE");
  }
  return [...selected];
}

export function calculateQuote(input: QuoteInput): Quote {
  const jurisdiction = getJurisdiction(input.jurisdiction);
  const entity = getEntityProfile(input.jurisdiction, input.entityType);
  const { currency, country } = jurisdiction;
  const plan = PLANS[input.plan];
  const addOns = resolveAddOns(input);
  const items: QuoteLineItem[] = [];

  // Government fees — pass-through, never taxed, always itemised separately.
  items.push({
    id: "gov-registration",
    label: `${jurisdiction.registry.code} registration fee`,
    category: "GOVERNMENT",
    amount: entity.governmentFee,
    note: `Paid directly to the ${jurisdiction.registry.name}`,
    taxable: false,
  });
  if (addOns.includes("EXPEDITED") && entity.governmentExpediteFee) {
    items.push({
      id: "gov-expedite",
      label: `${jurisdiction.registry.code} expedited handling (${entity.processingTime.expedited})`,
      category: "GOVERNMENT",
      amount: entity.governmentExpediteFee,
      taxable: false,
    });
  }

  items.push({
    id: "svc-formation",
    label: `${entity.shortLabel} formation service`,
    category: "SERVICE",
    amount: FORMATION_SERVICE_FEE[currency],
    note: "Includes name check, lodgement and full legal document pack",
    taxable: true,
  });

  for (const id of addOns) {
    const def = ADD_ONS[id];
    const included = plan.includes.includes(id);
    items.push({
      id: `addon-${id}`,
      label: localize(def.name, country),
      category: "ADDON",
      amount: included ? 0 : def.price[currency],
      listAmount: def.price[currency],
      recurring: def.recurring,
      note: included ? `Included in ${plan.name}` : undefined,
      taxable: true,
    });
  }

  if (plan.price[currency] > 0) {
    items.push({
      id: `plan-${plan.id}`,
      label: `${plan.name} (annual)`,
      category: "SUBSCRIPTION",
      amount: plan.price[currency],
      recurring: "year",
      taxable: true,
    });
  }

  const sum = (category: LineItemCategory) =>
    items.filter((i) => i.category === category).reduce((acc, i) => acc + i.amount, 0);

  let tax = 0;
  if (jurisdiction.serviceTax) {
    const taxable = items.filter((i) => i.taxable).reduce((acc, i) => acc + i.amount, 0);
    tax = Math.round(taxable * jurisdiction.serviceTax.rate);
    if (tax > 0) {
      items.push({
        id: "tax",
        label: `${jurisdiction.serviceTax.label} (${Math.round(jurisdiction.serviceTax.rate * 100)}% on service fees)`,
        category: "TAX",
        amount: tax,
        taxable: false,
      });
    }
  }

  const government = sum("GOVERNMENT");
  const service = sum("SERVICE");
  const addOnTotal = sum("ADDON");
  const subscription = sum("SUBSCRIPTION");
  const renewsAnnually = items
    .filter((i) => i.recurring === "year")
    .reduce((acc, i) => acc + i.amount, 0);

  return {
    currency,
    lineItems: items,
    totals: {
      government,
      service,
      addOns: addOnTotal,
      subscription,
      tax,
      dueToday: government + service + addOnTotal + subscription + tax,
      renewsAnnually,
    },
    taxLabel: jurisdiction.serviceTax?.label,
  };
}
