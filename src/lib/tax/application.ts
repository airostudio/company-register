import type { EntityType, Jurisdiction } from "@/lib/domain";
import { OFFICER_ROLE_LABELS, type OfficerRole } from "@/lib/domain";
import { countryName } from "@/lib/countries";
import { getEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import { formatAddress, type Address } from "@/lib/validation/address";

export type TaxAuthority = "IRS" | "ABR" | "HMRC";

/** Prefilled tax registration: what staff key into the authority's form (or the simulator issues against). */
export interface TaxApplication {
  authority: TaxAuthority;
  form: string;
  jurisdiction: Jurisdiction;
  entityType: EntityType;
  companyName: string;
  registryNumber: string;
  incorporatedAt: string;
  /** True when no responsible person has a local tax number (e.g. no SSN/ITIN): affects how the IRS application is made. */
  foreignApplicant: boolean;
  sections: { title: string; fields: [string, string][] }[];
}

export interface TaxApplicationInput {
  jurisdiction: Jurisdiction;
  entityType: EntityType;
  companyName: string;
  registryNumber: string;
  incorporatedAt: Date;
  address: Address;
  businessActivity: string;
  sicCodes: string[];
  officers: { fullName: string; roles: OfficerRole[]; residentialAddress: Address; nationality?: string | null }[];
  memberCount: number;
}

export function taxAuthorityFor(jurisdiction: Jurisdiction): TaxAuthority {
  return jurisdiction === "AU" ? "ABR" : jurisdiction === "UK" ? "HMRC" : "IRS";
}

export function buildTaxApplication(input: TaxApplicationInput): TaxApplication {
  const authority = taxAuthorityFor(input.jurisdiction);
  const profile = getJurisdiction(input.jurisdiction);
  const entity = getEntityProfile(input.jurisdiction, input.entityType);
  const responsible = input.officers.find((o) => o.roles.some((r) => r === "PRESIDENT" || r === "MANAGER" || r === "DIRECTOR")) ?? input.officers[0]!;
  const homeIso = input.jurisdiction === "AU" ? "AU" : input.jurisdiction === "UK" ? "GB" : "US";
  const foreignApplicant = responsible.residentialAddress.country !== homeIso;
  const incorporated = input.incorporatedAt.toISOString().slice(0, 10);
  const officerList = input.officers.map((o) => `${o.fullName} (${o.roles.map((r) => OFFICER_ROLE_LABELS[r]).join(", ")})`).join("; ");

  const company: [string, string][] = [
    ["Legal name", input.companyName],
    [profile.identifiers.companyNumber, input.registryNumber],
    ["Entity type", entity.label],
    ["Date of incorporation", incorporated],
    ["Business address", formatAddress(input.address)],
    ["Principal activity", input.businessActivity],
  ];

  switch (authority) {
    case "IRS":
      return {
        authority,
        form: "Form SS-4 — Application for Employer Identification Number",
        jurisdiction: input.jurisdiction,
        entityType: input.entityType,
        companyName: input.companyName,
        registryNumber: input.registryNumber,
        incorporatedAt: incorporated,
        foreignApplicant,
        sections: [
          { title: "Entity (lines 1–9)", fields: [...company, ["State of incorporation (9b)", profile.shortName], ["Type of entity (9a)", input.entityType === "US_LLC" ? `LLC — ${input.memberCount} member(s)${input.memberCount === 1 ? " (disregarded entity unless an election is made)" : " (partnership unless an election is made)"}` : "Corporation (Form 1120)"]] },
          {
            title: "Responsible party (lines 7a–7b)",
            fields: [
              ["Name", responsible.fullName],
              ["Role", responsible.roles.map((r) => OFFICER_ROLE_LABELS[r]).join(", ")],
              ["SSN / ITIN", foreignApplicant ? "None — foreign responsible party (file by fax/mail, write 'Foreign' on 7b)" : "Collect securely from the customer"],
              ["Residence", countryName(responsible.residentialAddress.country)],
            ],
          },
          {
            title: "Business (lines 10–18)",
            fields: [
              ["Reason for applying (10)", "Started new business"],
              ["Date business started (11)", incorporated],
              ["Closing month of accounting year (12)", "December"],
              ["Employees expected in next 12 months (13)", "0 unless the customer tells us otherwise"],
              ["Principal activity (16–17)", input.businessActivity],
            ],
          },
        ],
      };
    case "ABR":
      return {
        authority,
        form: "ABN application (company) with TFN and optional GST registration",
        jurisdiction: input.jurisdiction,
        entityType: input.entityType,
        companyName: input.companyName,
        registryNumber: input.registryNumber,
        incorporatedAt: incorporated,
        foreignApplicant,
        sections: [
          { title: "Entity", fields: company },
          { title: "Associates", fields: [["Directors / public officer", officerList]] },
          {
            title: "Registrations",
            fields: [
              ["ABN", "Apply — entitled as a company carrying on an enterprise in Australia"],
              ["Tax file number", "Apply"],
              ["GST", "Register if annual GST turnover will be A$75,000 or more (confirm with customer)"],
            ],
          },
        ],
      };
    case "HMRC":
      return {
        authority,
        form: "Corporation Tax registration (start of trading) — UTR",
        jurisdiction: input.jurisdiction,
        entityType: input.entityType,
        companyName: input.companyName,
        registryNumber: input.registryNumber,
        incorporatedAt: incorporated,
        foreignApplicant,
        sections: [
          { title: "Company", fields: [...company, ["SIC codes", input.sicCodes.join(", ")]] },
          {
            title: "Corporation Tax",
            fields: [
              ["Date started trading", "Confirm with customer (must register within 3 months)"],
              ["First accounting period", `${incorporated} to the accounting reference date`],
              ["Directors", officerList],
              ["PAYE employer scheme", "Only if the company will pay employees or directors' salaries"],
            ],
          },
        ],
      };
  }
}
