import { Prisma } from "@prisma/client";
import { getEntityProfile } from "@/lib/jurisdictions";
import { ADDRESS_SERVICE_PROVIDERS } from "@/lib/jurisdictions/service-providers";
import { calculateQuote, resolveAddOns, type Quote } from "@/lib/pricing/quote";
import { PLANS } from "@/lib/pricing/catalog";
import { buildFormationPayload, getRegistryAdapter } from "@/lib/registry";
import { fullCompanyName, summarizeOwnership, type FormationApplication } from "@/lib/validation/formation";
import { db, toJson } from "../db";
import { AppError } from "../errors";

export interface CreatedFormation {
  userId: string;
  /** True when this checkout created the account (it still needs email verification). */
  newUser: boolean;
  companyId: string;
  filingId: string;
  quote: Quote;
}

/**
 * Persist a validated application as a Company + QUEUED incorporation Filing
 * + paid Order. Lodgement with the registry happens asynchronously.
 *
 * @param sessionUserId the signed-in user, if any. An anonymous checkout may
 *   only use an email that doesn't already belong to an account.
 */
export async function createFormation(app: FormationApplication, sessionUserId?: string): Promise<CreatedFormation> {
  const { jurisdiction, entityType } = app.entity;
  const companyName = fullCompanyName(app);

  // Never trust the client's name check — availability may have changed since.
  const availability = await getRegistryAdapter(jurisdiction).checkNameAvailability(companyName, jurisdiction, {
    entityType,
    suggest: false,
  });
  if (!availability.available) {
    throw new AppError(409, "NAME_UNAVAILABLE", `"${companyName}" is no longer available`, availability);
  }

  const entity = getEntityProfile(jurisdiction, entityType);
  const quoteInput = {
    jurisdiction,
    entityType,
    addOns: app.addons.addOns,
    plan: app.addons.plan,
    useAddressService: app.details.useAddressService,
  };
  const quote = calculateQuote(quoteInput);
  const addOns = resolveAddOns(quoteInput);
  const provider = ADDRESS_SERVICE_PROVIDERS[jurisdiction];
  const ownership = summarizeOwnership(app.people.shareholders, app.people.totalUnits);
  const email = app.review.contactEmail.toLowerCase();

  const prisma = db();
  return prisma.$transaction(async (tx) => {
    const { user, created: newUser } = await resolveUser(tx, email, app.review.contactName, sessionUserId);

    const company = await tx.company.create({
      data: {
        ownerId: user.id,
        jurisdiction,
        entityType,
        status: "SUBMITTED",
        proposedName: companyName,
        registeredAddress: toJson(app.details.useAddressService ? provider.address : app.details.registeredAddress),
        principalAddress:
          app.details.useAddressService || !app.details.principalSameAsRegistered
            ? toJson(app.details.principalAddress)
            : Prisma.JsonNull,
        useRegisteredAgent: app.details.useAddressService,
        registeredAgentName: app.details.useAddressService ? provider.name : null,
        businessActivity: app.details.businessActivity,
        sicCodes: app.details.sicCodes,
        jurisdictionData: toJson({ ownershipKind: entity.ownership.kind, totalUnits: app.people.totalUnits, addOns }),
        formationPayload: toJson(app),
        officers: {
          create: app.people.officers.map((o) => ({
            roles: o.roles,
            fullName: o.fullName,
            email: o.email || null,
            dateOfBirth: o.dateOfBirth ? new Date(`${o.dateOfBirth}T00:00:00Z`) : null,
            placeOfBirth: o.placeOfBirth || null,
            nationality: o.nationality || null,
            residentialAddress: toJson(o.residentialAddress),
            directorId: o.directorId?.replace(/\s/g, "") || null,
            consentSignedAt: o.consentToAct ? new Date() : null,
          })),
        },
        shareholders: {
          create: app.people.shareholders.map((s, i) => ({
            holderType: s.holderType,
            fullName: s.fullName,
            email: s.email || null,
            address: toJson(s.address),
            shareClass: s.shareClass,
            shareCount: s.units,
            pricePerShare: new Prisma.Decimal(s.pricePerUnit),
            ownershipPercent: new Prisma.Decimal(ownership.holders[i]!.percent),
            beneficiallyHeld: s.beneficiallyHeld,
          })),
        },
        beneficialOwners: {
          create: app.people.beneficialOwners.map((b) => ({
            fullName: b.fullName,
            dateOfBirth: b.dateOfBirth ? new Date(`${b.dateOfBirth}T00:00:00Z`) : null,
            nationality: b.nationality || null,
            residentialAddress: toJson(b.residentialAddress),
            ownershipPercent: new Prisma.Decimal(b.ownershipPercent),
            natureOfControl: b.natureOfControl,
          })),
        },
      },
    });

    const filing = await tx.filing.create({
      data: {
        companyId: company.id,
        type: "INCORPORATION",
        status: "QUEUED",
        jurisdiction,
        expedited: addOns.includes("EXPEDITED"),
        events: { create: { status: "QUEUED", message: "Payment received — queued for lodgement." } },
      },
    });
    await tx.filing.update({
      where: { id: filing.id },
      data: { requestPayload: toJson(buildFormationPayload(app, filing.id)) },
    });

    await tx.order.create({
      data: {
        companyId: company.id,
        filingId: filing.id,
        currency: quote.currency,
        governmentFeeTotal: quote.totals.government,
        serviceFeeTotal: quote.totals.service,
        addOnTotal: quote.totals.addOns + quote.totals.subscription,
        taxTotal: quote.totals.tax,
        grandTotal: quote.totals.dueToday,
        lineItems: toJson(quote.lineItems),
        // Payments are mocked in this scaffold; wire Stripe Checkout here.
        paymentProvider: "mock",
        paymentReference: `mock_${filing.id}`,
        paidAt: new Date(),
      },
    });

    if (app.addons.plan !== "PAY_AS_YOU_GO") {
      const now = new Date();
      const end = new Date(now);
      end.setUTCFullYear(end.getUTCFullYear() + 1);
      await tx.subscription.create({
        data: {
          userId: user.id,
          companyId: company.id,
          plan: app.addons.plan,
          status: "ACTIVE",
          includesRegisteredAgent: PLANS[app.addons.plan].includes.includes("REGISTERED_AGENT"),
          currentPeriodStart: now,
          currentPeriodEnd: end,
        },
      });
    }

    return { userId: user.id, newUser, companyId: company.id, filingId: filing.id, quote };
  });
}

async function resolveUser(tx: Prisma.TransactionClient, email: string, name: string, sessionUserId?: string) {
  if (sessionUserId) {
    const user = await tx.user.findUnique({ where: { id: sessionUserId } });
    if (user) return { user, created: false };
  }
  const existing = await tx.user.findUnique({ where: { email } });
  if (existing) {
    // Don't let an anonymous checkout attach itself to someone else's account.
    throw new AppError(409, "ACCOUNT_EXISTS", "An account with this email already exists. Sign in to continue.");
  }
  return { user: await tx.user.create({ data: { email, name } }), created: true };
}
