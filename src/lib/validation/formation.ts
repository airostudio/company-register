import { z } from "zod";
import {
  ENTITY_TYPES,
  JURISDICTIONS,
  OFFICER_ROLES,
  OFFICER_ROLE_LABELS,
  SHARE_CLASSES,
  SHARE_CLASS_LABELS,
  SUBSCRIPTION_PLANS,
  type EntityType,
  type Jurisdiction,
} from "@/lib/domain";
import { countryName, jurisdictionIso } from "@/lib/countries";
import {
  composeCompanyName,
  getEntityProfile,
  getJurisdiction,
  isEntityTypeAvailable,
} from "@/lib/jurisdictions";
import { COMPANY_NAME_CHARS, LEGAL_ENDING_REGEX, normalizeCompanyName } from "@/lib/names";
import { ADD_ONS, ADD_ON_IDS, isAddOnAvailable } from "@/lib/pricing/catalog";
import { addIssue, addressSchema, checkAddress } from "./address";

// ─── Step 1: Country & entity type ──────────────────────────────────────────

export const entityStepSchema = z
  .object({
    jurisdiction: z.enum(JURISDICTIONS, { error: "Choose where to register" }),
    entityType: z.enum(ENTITY_TYPES, { error: "Choose an entity type" }),
  })
  .superRefine((v, ctx) => {
    if (!isEntityTypeAvailable(v.jurisdiction, v.entityType)) {
      addIssue(ctx, ["entityType"], `This entity type isn't available in ${getJurisdiction(v.jurisdiction).name}`);
    }
  });
export type EntityStep = z.infer<typeof entityStepSchema>;

// ─── Step 2: Name ───────────────────────────────────────────────────────────

export const nameAvailabilitySchema = z.object({
  checkedName: z.string(),
  available: z.boolean(),
  checkedAt: z.string(),
});
export type NameAvailabilitySnapshot = z.infer<typeof nameAvailabilitySchema>;

export function createNameStepSchema(jurisdiction: Jurisdiction, entityType: EntityType) {
  const entity = getEntityProfile(jurisdiction, entityType);
  return z
    .object({
      baseName: z
        .string()
        .trim()
        .min(2, "Enter at least 2 characters")
        .max(150, "Company names are limited to 150 characters")
        .regex(COMPANY_NAME_CHARS, "Use letters, numbers and basic punctuation only"),
      suffix: z.string(),
      availability: nameAvailabilitySchema.nullable().optional(),
    })
    .superRefine((v, ctx) => {
      if (!entity.suffixes.includes(v.suffix)) {
        addIssue(ctx, ["suffix"], `Choose a legal ending for a ${entity.shortLabel}`);
      }
      const ending = LEGAL_ENDING_REGEX.exec(v.baseName)?.[1];
      if (ending) {
        addIssue(ctx, ["baseName"], `Leave out "${ending}" — pick the legal ending from the list instead`);
        return;
      }
      const fullName = composeCompanyName(v.baseName, v.suffix);
      if (!v.availability || normalizeCompanyName(v.availability.checkedName) !== normalizeCompanyName(fullName)) {
        addIssue(ctx, ["availability"], "Check that this name is available before continuing");
      } else if (!v.availability.available) {
        addIssue(ctx, ["availability"], "This name isn't available — try one of the suggestions");
      }
    });
}
export type NameStep = z.infer<ReturnType<typeof createNameStepSchema>>;

// ─── Step 3: Company details ────────────────────────────────────────────────

export function createDetailsStepSchema(jurisdiction: Jurisdiction) {
  const profile = getJurisdiction(jurisdiction);
  const iso = jurisdictionIso(jurisdiction);
  const requiredRegion = profile.address.requiredRegion;
  return z
    .object({
      /** Use our registered agent (US) / registered office service (AU, UK). */
      useAddressService: z.boolean(),
      registeredAddress: addressSchema.optional(),
      principalSameAsRegistered: z.boolean(),
      principalAddress: addressSchema.optional(),
      businessActivity: z
        .string()
        .trim()
        .min(10, "Describe what the company will do (at least 10 characters)")
        .max(500, "Keep it under 500 characters"),
      sicCodes: z.array(z.string()).max(4, "Choose up to 4 SIC codes"),
    })
    .superRefine((v, ctx) => {
      if (!v.useAddressService) {
        checkAddress(ctx, v.registeredAddress, ["registeredAddress"], {
          requirePhysical: profile.address.requiresPhysicalAddress,
          requiredCountry: iso,
          requiredRegion: requiredRegion
            ? {
                code: requiredRegion,
                message: `Your own registered office must be in ${profile.shortName}. Otherwise, use our registered agent.`,
              }
            : undefined,
        });
      }
      const needsPrincipal =
        profile.address.hasPrincipalPlaceOfBusiness && (v.useAddressService || !v.principalSameAsRegistered);
      if (needsPrincipal) {
        checkAddress(ctx, v.principalAddress, ["principalAddress"], {
          requirePhysical: jurisdiction === "AU",
          requiredCountry: jurisdiction === "AU" ? "AU" : undefined,
        });
      }
      if (profile.requiresSicCodes && v.sicCodes.length === 0) {
        addIssue(ctx, ["sicCodes"], "Choose at least one SIC code describing the business");
      }
    });
}
export type DetailsStep = z.infer<ReturnType<typeof createDetailsStepSchema>>;

// ─── Step 4: People & ownership ─────────────────────────────────────────────

const optionalEmail = z.union([z.literal(""), z.email("Enter a valid email address")]).optional();
const isoDate = z.union([z.literal(""), z.iso.date("Use the format YYYY-MM-DD")]).optional();
const identityCode = z
  .union([z.literal(""), z.string().trim().regex(/^[A-Za-z0-9]{8,15}$/, "Enter the personal code exactly as Companies House issued it")])
  .optional();

export const officerSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().trim().min(2, "Enter the person's full legal name").max(120),
  email: optionalEmail,
  roles: z.array(z.enum(OFFICER_ROLES)).min(1, "Select at least one role"),
  dateOfBirth: isoDate,
  placeOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  residentialAddress: addressSchema,
  directorId: z.string().optional(),
  /** UK: Companies House identity-verification personal code (directors, since Nov 2025). */
  identityVerificationCode: identityCode,
  consentToAct: z.boolean(),
});
export type OfficerInput = z.infer<typeof officerSchema>;

export const shareholderSchema = z.object({
  id: z.string().min(1),
  holderType: z.enum(["INDIVIDUAL", "CORPORATE"]),
  fullName: z.string().trim().min(2, "Enter the shareholder's full legal name").max(160),
  email: optionalEmail,
  address: addressSchema,
  shareClass: z.enum(SHARE_CLASSES),
  units: z.number({ error: "Enter a whole number" }).int("Enter a whole number").min(1, "Allocate at least 1"),
  /** Issue price per unit in major units (supports sub-cent par values). */
  pricePerUnit: z.number({ error: "Enter an amount" }).min(0, "Can't be negative").max(1_000_000),
  beneficiallyHeld: z.boolean(),
});
export type ShareholderInput = z.infer<typeof shareholderSchema>;

export const beneficialOwnerSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().trim().min(2, "Enter the person's full legal name").max(120),
  dateOfBirth: isoDate,
  nationality: z.string().optional(),
  residentialAddress: addressSchema,
  ownershipPercent: z.number({ error: "Enter a percentage" }).min(0).max(100, "Can't exceed 100%"),
  identityVerificationCode: identityCode,
  natureOfControl: z.array(z.string()).min(1, "Select at least one nature of control"),
});
export type BeneficialOwnerInput = z.infer<typeof beneficialOwnerSchema>;

export interface OwnershipSummary {
  totalUnits: number;
  allocated: number;
  remaining: number;
  percentAllocated: number;
  holders: { id: string; name: string; units: number; percent: number; holderType: "INDIVIDUAL" | "CORPORATE" }[];
  isComplete: boolean;
}

/** Live ownership maths shared by the People step UI and its validator. */
export function summarizeOwnership(
  shareholders: Pick<ShareholderInput, "id" | "fullName" | "units" | "holderType">[],
  totalUnits: number,
): OwnershipSummary {
  const safeTotal = Number.isFinite(totalUnits) && totalUnits > 0 ? totalUnits : 0;
  const holders = shareholders.map((s) => {
    const units = Number.isFinite(s.units) ? s.units : 0;
    return {
      id: s.id,
      name: s.fullName,
      units,
      percent: safeTotal ? round2((units / safeTotal) * 100) : 0,
      holderType: s.holderType,
    };
  });
  const allocated = holders.reduce((acc, h) => acc + h.units, 0);
  return {
    totalUnits: safeTotal,
    allocated,
    remaining: safeTotal - allocated,
    percentAllocated: safeTotal ? round2((allocated / safeTotal) * 100) : 0,
    holders,
    isComplete: safeTotal > 0 && allocated === safeTotal,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function ageOn(dateOfBirth: string, today: Date): number {
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const m = today.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

export function createPeopleStepSchema(
  jurisdiction: Jurisdiction,
  entityType: EntityType,
  opts: { today?: Date } = {},
) {
  const profile = getJurisdiction(jurisdiction);
  const entity = getEntityProfile(jurisdiction, entityType);
  const rules = profile.people;
  const bo = rules.beneficialOwnership;
  const unit = entity.ownership.unitLabel;

  return z
    .object({
      officers: z.array(officerSchema).min(1, "Add at least one officer"),
      totalUnits: z.number({ error: "Enter a whole number" }).int().positive("Must be greater than 0"),
      shareholders: z
        .array(shareholderSchema)
        .min(1, entity.ownership.kind === "membership" ? "Add at least one member" : "Add at least one shareholder"),
      beneficialOwners: z.array(beneficialOwnerSchema),
      /** Explicit statement that nobody meets the beneficial-ownership test. */
      noBeneficialOwners: z.boolean(),
    })
    .superRefine((v, ctx) => {
      const today = opts.today ?? new Date();

      // Officer role requirements (e.g. ≥1 director; C-Corp needs a President & Secretary).
      for (const req of entity.officerRequirements) {
        const count = v.officers.filter((o) => o.roles.includes(req.role)).length;
        if (count < req.min) addIssue(ctx, ["officers"], req.message);
      }

      v.officers.forEach((o, i) => {
        const base = ["officers", i];
        const disallowed = o.roles.filter((r) => !entity.allowedOfficerRoles.includes(r));
        if (disallowed.length) {
          addIssue(
            ctx,
            [...base, "roles"],
            `${disallowed.map((r) => OFFICER_ROLE_LABELS[r]).join(", ")} isn't a role for a ${entity.shortLabel}`,
          );
        }
        checkAddress(ctx, o.residentialAddress, [...base, "residentialAddress"], { requirePhysical: true });
        if (!o.consentToAct) {
          addIssue(ctx, [...base, "consentToAct"], "This person must consent to act before we can lodge");
        }

        const isDirector = o.roles.includes("DIRECTOR");
        if (!isDirector) return;
        if (rules.requiresDateOfBirth && !o.dateOfBirth) {
          addIssue(ctx, [...base, "dateOfBirth"], "Date of birth is required for directors");
        }
        if (o.dateOfBirth && rules.directorMinimumAge && ageOn(o.dateOfBirth, today) < rules.directorMinimumAge) {
          addIssue(ctx, [...base, "dateOfBirth"], `Directors must be at least ${rules.directorMinimumAge} years old`);
        }
        if (rules.requiresPlaceOfBirth && !o.placeOfBirth?.trim()) {
          addIssue(ctx, [...base, "placeOfBirth"], "Place of birth (town and country) is required for directors");
        }
        if (rules.requiresDirectorId && !/^\d{15}$/.test(o.directorId?.replace(/\s/g, "") ?? "")) {
          addIssue(ctx, [...base, "directorId"], "Enter the 15-digit Director ID");
        }
      });

      if (rules.residentDirectorCountry) {
        const iso = rules.residentDirectorCountry === "UK" ? "GB" : rules.residentDirectorCountry;
        const hasResident = v.officers.some(
          (o) => o.roles.includes("DIRECTOR") && o.residentialAddress.country === iso,
        );
        if (!hasResident) {
          addIssue(ctx, ["officers"], `At least one director must ordinarily reside in ${countryName(iso)}`);
        }
      }

      // Ownership must be fully allocated (the live "sums to 100%" validator).
      if (!entity.ownership.totalUnitsEditable && v.totalUnits !== entity.ownership.defaultTotalUnits) {
        addIssue(ctx, ["totalUnits"], `Total must be ${entity.ownership.defaultTotalUnits}`);
      }
      const summary = summarizeOwnership(v.shareholders, v.totalUnits);
      if (v.shareholders.length > 0 && !summary.isComplete) {
        const noun = entity.ownership.kind === "membership" ? "Membership interests" : `Allocated ${unit.plural}`;
        addIssue(
          ctx,
          ["shareholders"],
          entity.ownership.kind === "membership"
            ? `${noun} add up to ${summary.allocated}% — they must total exactly 100%`
            : `${noun} (${summary.allocated.toLocaleString()} of ${summary.totalUnits.toLocaleString()}, ${summary.percentAllocated}%) must total 100%`,
        );
      }
      v.shareholders.forEach((s, i) => {
        if (!entity.ownership.shareClasses.includes(s.shareClass)) {
          addIssue(ctx, ["shareholders", i, "shareClass"], `${SHARE_CLASS_LABELS[s.shareClass]} can't be issued by a ${entity.shortLabel}`);
        }
        checkAddress(ctx, s.address, ["shareholders", i, "address"]);
      });

      // Beneficial ownership / PSC.
      const controlOptions = new Set(bo.natureOfControlOptions.map((o) => o.value));
      v.beneficialOwners.forEach((b, i) => {
        checkAddress(ctx, b.residentialAddress, ["beneficialOwners", i, "residentialAddress"], { requirePhysical: true });
        if (b.natureOfControl.some((n) => !controlOptions.has(n))) {
          addIssue(ctx, ["beneficialOwners", i, "natureOfControl"], "Choose from the listed nature-of-control statements");
        }
      });
      const declared = new Set(v.beneficialOwners.map((b) => b.fullName.trim().toLowerCase()));
      const significant = summary.holders.filter(
        (h) => h.holderType === "INDIVIDUAL" && h.percent >= bo.thresholdPercent,
      );
      const missing = significant.filter((h) => !declared.has(h.name.trim().toLowerCase()));
      if (missing.length) {
        addIssue(
          ctx,
          ["beneficialOwners"],
          `${missing.map((m) => `${m.name} (${m.percent}%)`).join(", ")} must be declared as ${bo.shortLabel === "PSC" ? "a PSC" : "a beneficial owner"}`,
        );
      }
      if (v.noBeneficialOwners && (v.beneficialOwners.length > 0 || significant.length > 0)) {
        addIssue(ctx, ["noBeneficialOwners"], `You can't make this statement when someone meets the ${bo.thresholdPercent}% test`);
      }
      if (bo.required && v.beneficialOwners.length === 0 && !v.noBeneficialOwners) {
        addIssue(ctx, ["beneficialOwners"], `Add at least one ${bo.shortLabel}, or confirm the company has none`);
      }
    });
}
export type PeopleStep = z.infer<ReturnType<typeof createPeopleStepSchema>>;

// ─── Step 5: Add-ons ────────────────────────────────────────────────────────

export function createAddOnsStepSchema(jurisdiction: Jurisdiction) {
  return z
    .object({
      addOns: z.array(z.enum(ADD_ON_IDS)),
      plan: z.enum(SUBSCRIPTION_PLANS),
    })
    .superRefine((v, ctx) => {
      v.addOns.forEach((id, i) => {
        if (!isAddOnAvailable(id, jurisdiction)) {
          addIssue(ctx, ["addOns", i], `${typeof ADD_ONS[id].name === "string" ? ADD_ONS[id].name : id} isn't available here`);
        }
      });
    });
}
export type AddOnsStep = z.infer<ReturnType<typeof createAddOnsStepSchema>>;

// ─── Step 6: Review ─────────────────────────────────────────────────────────

export const reviewStepSchema = z.object({
  contactName: z.string().trim().min(2, "Enter your name"),
  contactEmail: z.email("Enter a valid email address"),
  confirmAccuracy: z.boolean().refine((v) => v, "Please confirm the details are correct"),
  acceptTerms: z.boolean().refine((v) => v, "You must accept the terms of service"),
});
export type ReviewStep = z.infer<typeof reviewStepSchema>;

// ─── Whole application ──────────────────────────────────────────────────────

export interface FormationApplication {
  entity: EntityStep;
  name: NameStep;
  details: DetailsStep;
  people: PeopleStep;
  addons: AddOnsStep;
  review: ReviewStep;
}

export type FormationSection = keyof FormationApplication;

export function createStepSchemas(jurisdiction: Jurisdiction, entityType: EntityType) {
  return {
    entity: entityStepSchema,
    name: createNameStepSchema(jurisdiction, entityType),
    details: createDetailsStepSchema(jurisdiction),
    people: createPeopleStepSchema(jurisdiction, entityType),
    addons: createAddOnsStepSchema(jurisdiction),
    review: reviewStepSchema,
  } as const;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ParseResult<T> = { success: true; data: T } | { success: false; issues: ValidationIssue[] };

function toIssues(section: string, error: z.ZodError): ValidationIssue[] {
  return error.issues.map((i) => ({ path: [section, ...i.path].join("."), message: i.message }));
}

/** Server-side validation of a full submission (never trust the client wizard). */
export function parseFormationApplication(input: unknown): ParseResult<FormationApplication> {
  const shape = z
    .object({
      entity: z.unknown(),
      name: z.unknown(),
      details: z.unknown(),
      people: z.unknown(),
      addons: z.unknown(),
      review: z.unknown(),
    })
    .safeParse(input);
  if (!shape.success) return { success: false, issues: toIssues("application", shape.error) };

  const entity = entityStepSchema.safeParse(shape.data.entity);
  if (!entity.success) return { success: false, issues: toIssues("entity", entity.error) };

  const schemas = createStepSchemas(entity.data.jurisdiction, entity.data.entityType);
  const issues: ValidationIssue[] = [];
  const parsed: Partial<FormationApplication> = { entity: entity.data };
  for (const section of ["name", "details", "people", "addons", "review"] as const) {
    const result = schemas[section].safeParse(shape.data[section]);
    if (result.success) {
      (parsed as Record<string, unknown>)[section] = result.data;
    } else {
      issues.push(...toIssues(section, result.error));
    }
  }
  if (issues.length) return { success: false, issues };
  return { success: true, data: parsed as FormationApplication };
}

export function fullCompanyName(app: Pick<FormationApplication, "name">): string {
  return composeCompanyName(app.name.baseName, app.name.suffix);
}
