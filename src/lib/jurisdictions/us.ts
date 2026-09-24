import type { EntityTypeProfile, JurisdictionProfile, PeopleRules } from "./types";

const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
  ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
  ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
].map(([code, name]) => ({ code: code!, name: name! }));

const US_PEOPLE: PeopleRules = {
  requiresDirectorId: false,
  requiresPlaceOfBirth: false,
  requiresDateOfBirth: false,
  beneficialOwnership: {
    label: "Beneficial owners (BOI)",
    shortLabel: "Beneficial owner",
    thresholdPercent: 25,
    required: false,
    natureOfControlOptions: [
      { value: "OWNERSHIP_25", label: "Owns or controls 25%+ of ownership interests" },
      { value: "SENIOR_OFFICER", label: "Senior officer" },
      { value: "APPOINTMENT_AUTHORITY", label: "Can appoint or remove officers/directors" },
      { value: "SUBSTANTIAL_CONTROL", label: "Other substantial control" },
    ],
  },
};

const US_HELP = {
  registeredAgent: {
    title: "What is a registered agent?",
    body: "Every US company must appoint a registered agent with a physical address in its state of formation to accept lawsuits and official state mail during business hours. If you don't have an in-state address, our registered agent service covers this.",
  },
  physicalAddress: {
    title: "Why do I need a physical address?",
    body: "The state needs a street address (not a PO box) for your registered office. With a registered agent, the agent's address is used and your own address can be anywhere in the world.",
  },
  ein: {
    title: "What is an EIN?",
    body: "An Employer Identification Number is the IRS tax ID for your company. You need it to open a US bank account, hire staff and file taxes. Non-US founders without an SSN can still get one — we file Form SS-4 for you.",
  },
  llcVsCorp: {
    title: "LLC or C-Corp?",
    body: "LLCs are simple and tax-transparent — great for small businesses and solo founders. C-Corps are the standard for venture-backed startups because they can issue preferred stock and stock options.",
  },
  membershipInterest: {
    title: "Membership interest",
    body: "An LLC is owned by its members in percentages rather than shares. The percentages must add up to 100%.",
  },
  shares: {
    title: "Authorized shares",
    body: "Startups commonly issue 10,000,000 shares of common stock at a very low par value ($0.00001) so founders can buy in cheaply and there's room for option pools.",
  },
  beneficialOwner: {
    title: "Beneficial ownership (BOI)",
    body: "Individuals who own 25%+ or exercise substantial control may need to be reported to FinCEN depending on current federal rules. We collect this now so filings can be made if required.",
  },
  nonResident: {
    title: "Non-US founders",
    body: "You don't need to be a US citizen or resident to own or run a US company. We handle registered agent service, EIN applications without an SSN, and bank account introductions.",
  },
};

function llc(governmentFee: number, expediteFee: number | undefined, expedited: string | undefined): EntityTypeProfile {
  return {
    type: "US_LLC",
    label: "Limited Liability Company (LLC)",
    shortLabel: "LLC",
    description: "Flexible, pass-through taxation and minimal paperwork. Ideal for small businesses and solo founders.",
    suffixes: ["LLC", "L.L.C.", "Limited Liability Company"],
    allowedOfficerRoles: ["MANAGER", "ORGANIZER"],
    officerRequirements: [
      { role: "MANAGER", min: 1, message: "Add at least one manager (or managing member) for the LLC." },
    ],
    ownership: {
      kind: "membership",
      shareClasses: ["MEMBERSHIP_INTEREST"],
      defaultShareClass: "MEMBERSHIP_INTEREST",
      defaultTotalUnits: 100,
      defaultPricePerUnit: 0,
      unitLabel: { singular: "%", plural: "%" },
      totalUnitsEditable: false,
    },
    documentPack: ["CERTIFICATE_OF_INCORPORATION", "OPERATING_AGREEMENT", "SHAREHOLDER_REGISTER", "CONSENT_TO_ACT"],
    governmentFee,
    governmentExpediteFee: expediteFee,
    processingTime: { standard: "3–5 business days", expedited },
    popular: true,
  };
}

function cCorp(governmentFee: number, expediteFee: number | undefined, expedited: string | undefined): EntityTypeProfile {
  return {
    type: "US_C_CORP",
    label: "C-Corporation (Inc.)",
    shortLabel: "C-Corp",
    description: "The standard for venture-backed startups. Issue common and preferred stock and grant options.",
    suffixes: ["Inc.", "Corp.", "Corporation", "Incorporated"],
    allowedOfficerRoles: ["DIRECTOR", "PRESIDENT", "SECRETARY", "TREASURER"],
    officerRequirements: [
      { role: "DIRECTOR", min: 1, message: "A corporation needs at least one director on its board." },
      { role: "PRESIDENT", min: 1, message: "Appoint a President / CEO." },
      { role: "SECRETARY", min: 1, message: "Appoint a Secretary (the same person can hold several offices)." },
    ],
    ownership: {
      kind: "shares",
      shareClasses: ["COMMON", "PREFERRED"],
      defaultShareClass: "COMMON",
      defaultTotalUnits: 10_000_000,
      defaultPricePerUnit: 0,
      unitLabel: { singular: "share", plural: "shares" },
      totalUnitsEditable: true,
    },
    documentPack: [
      "CERTIFICATE_OF_INCORPORATION",
      "BYLAWS",
      "SHAREHOLDER_REGISTER",
      "SHARE_CERTIFICATE",
      "CONSENT_TO_ACT",
    ],
    governmentFee,
    governmentExpediteFee: expediteFee,
    processingTime: { standard: "3–7 business days", expedited },
  };
}

const usAddressBase = {
  regionLabel: "State",
  regions: US_STATES,
  postcodeLabel: "ZIP code",
  postcodePattern: /^\d{5}(-\d{4})?$/,
  postcodeExample: "19801",
  requiresPhysicalAddress: true,
  hasPrincipalPlaceOfBusiness: true,
  registeredAgent: "required" as const,
  virtualOfficeAvailable: true,
};

export const delaware: JurisdictionProfile = {
  code: "US_DE",
  country: "US",
  name: "United States — Delaware",
  shortName: "Delaware",
  flag: "🇺🇸",
  currency: "USD",
  registry: {
    code: "DE-DOC",
    name: "Delaware Division of Corporations",
    url: "https://corp.delaware.gov",
  },
  identifiers: {
    companyNumber: "File Number",
    taxId: "EIN",
    taxIdDescription: "Employer Identification Number, issued by the IRS",
  },
  entityTypes: [llc(110_00, 100_00, "24 hours"), cCorp(109_00, 100_00, "24 hours")],
  address: { ...usAddressBase, requiredRegion: "DE" },
  people: US_PEOPLE,
  requiresSicCodes: false,
  compliance: [
    {
      type: "FRANCHISE_TAX",
      title: "Delaware LLC annual tax",
      description: "Flat $300 annual tax due to the State of Delaware.",
      schedule: { kind: "fixed-date", month: 6, day: 1 },
      feeEstimate: 300_00,
      appliesTo: ["US_LLC"],
    },
    {
      type: "ANNUAL_REPORT",
      title: "Delaware annual report & franchise tax",
      description:
        "Corporations file an annual report and pay franchise tax (minimum $175 + $50 filing fee using the assumed par value method).",
      schedule: { kind: "fixed-date", month: 3, day: 1 },
      feeEstimate: 225_00,
      appliesTo: ["US_C_CORP"],
    },
    {
      type: "REGISTERED_AGENT_RENEWAL",
      title: "Registered agent renewal",
      description: "Annual renewal of registered agent service in Delaware.",
      schedule: { kind: "anniversary" },
      feeEstimate: 125_00,
    },
    {
      type: "TAX_RETURN",
      title: "Federal tax return (IRS)",
      description: "Form 1120 for corporations; Form 1065 or 5472/pro-forma 1120 for LLCs depending on ownership.",
      schedule: { kind: "fixed-date", month: 4, day: 15 },
    },
  ],
  help: {
    ...US_HELP,
    delaware: {
      title: "Why Delaware?",
      body: "Delaware has the most developed body of corporate law in the US and a specialist business court. Most investors expect startups to be Delaware C-Corps.",
    },
    fileNumber: {
      title: "What is a Delaware file number?",
      body: "The unique 7-digit number the Division of Corporations assigns to your entity. It appears on your certificate and is needed for annual filings.",
    },
  },
};

export const wyoming: JurisdictionProfile = {
  code: "US_WY",
  country: "US",
  name: "United States — Wyoming",
  shortName: "Wyoming",
  flag: "🇺🇸",
  currency: "USD",
  registry: {
    code: "WY-SOS",
    name: "Wyoming Secretary of State",
    url: "https://sos.wyo.gov",
  },
  identifiers: {
    companyNumber: "Filing ID",
    taxId: "EIN",
    taxIdDescription: "Employer Identification Number, issued by the IRS",
  },
  entityTypes: [llc(100_00, undefined, undefined), cCorp(100_00, undefined, undefined)],
  address: { ...usAddressBase, requiredRegion: "WY" },
  people: US_PEOPLE,
  requiresSicCodes: false,
  compliance: [
    {
      type: "ANNUAL_REPORT",
      title: "Wyoming annual report",
      description:
        "Due on the first day of your anniversary month. License tax is $60 minimum, based on assets located in Wyoming.",
      schedule: { kind: "anniversary" },
      feeEstimate: 60_00,
    },
    {
      type: "REGISTERED_AGENT_RENEWAL",
      title: "Registered agent renewal",
      description: "Annual renewal of registered agent service in Wyoming.",
      schedule: { kind: "anniversary" },
      feeEstimate: 125_00,
    },
    {
      type: "TAX_RETURN",
      title: "Federal tax return (IRS)",
      description: "Form 1120 for corporations; Form 1065 or 5472/pro-forma 1120 for LLCs depending on ownership.",
      schedule: { kind: "fixed-date", month: 4, day: 15 },
    },
  ],
  help: {
    ...US_HELP,
    wyoming: {
      title: "Why Wyoming?",
      body: "Wyoming has low fees, no state income tax, strong privacy protections and a low $60 annual report — popular with small online businesses and non-US founders.",
    },
    fileNumber: {
      title: "What is a Wyoming filing ID?",
      body: "The unique ID the Secretary of State assigns to your entity, e.g. 2026-001234567.",
    },
  },
};
