import type { JurisdictionProfile } from "./types";

/** Australia — ASIC (Corporations Act 2001) + ABR for ABN/TFN. */
export const australia: JurisdictionProfile = {
  code: "AU",
  country: "AU",
  name: "Australia",
  shortName: "Australia",
  flag: "🇦🇺",
  currency: "AUD",
  registry: {
    code: "ASIC",
    name: "Australian Securities & Investments Commission",
    url: "https://asic.gov.au",
  },
  identifiers: {
    companyNumber: "ACN",
    taxId: "ABN",
    taxIdDescription: "Australian Business Number, issued by the Australian Business Register",
  },
  entityTypes: [
    {
      type: "AU_PTY_LTD",
      label: "Proprietary Limited Company (Pty Ltd)",
      shortLabel: "Pty Ltd",
      description:
        "The standard private company in Australia. Limited liability, up to 50 non-employee shareholders.",
      suffixes: ["Pty Ltd", "Pty. Ltd.", "Proprietary Limited"],
      allowedOfficerRoles: ["DIRECTOR", "SECRETARY"],
      officerRequirements: [
        {
          role: "DIRECTOR",
          min: 1,
          message: "A proprietary company needs at least one director.",
        },
      ],
      ownership: {
        kind: "shares",
        shareClasses: ["ORDINARY", "PREFERRED"],
        defaultShareClass: "ORDINARY",
        defaultTotalUnits: 100,
        defaultPricePerUnit: 1,
        unitLabel: { singular: "share", plural: "shares" },
        totalUnitsEditable: true,
      },
      documentPack: [
        "CERTIFICATE_OF_INCORPORATION",
        "CONSTITUTION",
        "SHAREHOLDER_REGISTER",
        "SHARE_CERTIFICATE",
        "CONSENT_TO_ACT",
      ],
      governmentFee: 611_00,
      processingTime: { standard: "Usually within 1 business day" },
      popular: true,
    },
  ],
  address: {
    regionLabel: "State / Territory",
    regions: [
      { code: "NSW", name: "New South Wales" },
      { code: "VIC", name: "Victoria" },
      { code: "QLD", name: "Queensland" },
      { code: "WA", name: "Western Australia" },
      { code: "SA", name: "South Australia" },
      { code: "TAS", name: "Tasmania" },
      { code: "ACT", name: "Australian Capital Territory" },
      { code: "NT", name: "Northern Territory" },
    ],
    postcodeLabel: "Postcode",
    postcodePattern: /^\d{4}$/,
    postcodeExample: "2000",
    requiresPhysicalAddress: true,
    hasPrincipalPlaceOfBusiness: true,
    registeredAgent: "unavailable",
    virtualOfficeAvailable: true,
  },
  people: {
    residentDirectorCountry: "AU",
    directorMinimumAge: 18,
    requiresDirectorId: true,
    requiresPlaceOfBirth: true,
    requiresDateOfBirth: true,
    beneficialOwnership: {
      label: "Beneficial owners",
      shortLabel: "Beneficial owner",
      thresholdPercent: 25,
      required: false,
      natureOfControlOptions: [
        { value: "SHARES_HELD_ON_TRUST", label: "Holds shares on trust for this person" },
        { value: "VOTING_CONTROL", label: "Controls 25%+ of voting rights" },
        { value: "SIGNIFICANT_INFLUENCE", label: "Exercises significant influence or control" },
      ],
    },
  },
  requiresSicCodes: false,
  serviceTax: { label: "GST", rate: 0.1 },
  compliance: [
    {
      type: "ANNUAL_REVIEW",
      title: "ASIC annual review",
      description:
        "ASIC issues an annual statement on the anniversary of registration. Review company details and pay the review fee within 2 months.",
      schedule: { kind: "anniversary", offsetDays: 60 },
      feeEstimate: 329_00,
    },
    {
      type: "TAX_RETURN",
      title: "Company tax return (ATO)",
      description: "Lodge the company income tax return for the financial year ending 30 June.",
      schedule: { kind: "fixed-date", month: 2, day: 28 },
    },
  ],
  help: {
    physicalAddress: {
      title: "Why do I need a physical address?",
      body: "Under the Corporations Act, a company's registered office must be a street address in Australia where legal documents can be served in person. PO boxes are not accepted. If you don't have one, you can use our registered office service.",
    },
    principalPlace: {
      title: "Registered office vs principal place of business",
      body: "The registered office is where official notices are delivered. The principal place of business is where the company actually operates. They can be the same address.",
    },
    acn: {
      title: "What is an ACN?",
      body: "The Australian Company Number is a unique 9-digit number ASIC issues when your company is registered. It must appear on invoices, contracts and your company's common seal (if any).",
    },
    abn: {
      title: "What is an ABN?",
      body: "An Australian Business Number identifies your business to the ATO and other businesses. You need one to register for GST and to invoice customers. It is separate from your ACN.",
    },
    directorId: {
      title: "What is a Director ID?",
      body: "Every director must have a 15-digit Director Identification Number from the Australian Business Registry Services before being appointed. It's free and stays with you for life.",
    },
    residentDirector: {
      title: "Resident director requirement",
      body: "A proprietary company must have at least one director who ordinarily resides in Australia.",
    },
    shares: {
      title: "How many shares should I issue?",
      body: "Most small companies issue 100 or 1,000 ordinary shares at $1 each. The number doesn't change the company's value — it only determines how ownership is split.",
    },
    beneficialOwner: {
      title: "Beneficially held shares",
      body: "If a shareholder holds shares on behalf of someone else (e.g. as a trustee), ASIC requires this to be disclosed.",
    },
  },
};
