import type { JurisdictionProfile } from "./types";

/** United Kingdom — Companies House (Companies Act 2006). */
export const unitedKingdom: JurisdictionProfile = {
  code: "UK",
  country: "UK",
  name: "United Kingdom",
  shortName: "United Kingdom",
  flag: "🇬🇧",
  currency: "GBP",
  registry: {
    code: "CH",
    name: "Companies House",
    url: "https://www.gov.uk/government/organisations/companies-house",
  },
  identifiers: {
    companyNumber: "Company Number",
    taxId: "UTR",
    taxIdDescription: "Unique Taxpayer Reference for Corporation Tax, issued by HMRC",
  },
  entityTypes: [
    {
      type: "UK_LTD",
      label: "Private Limited Company (Ltd)",
      shortLabel: "Ltd",
      description: "The most common UK company. Limited by shares, owned by shareholders and run by directors.",
      suffixes: ["Ltd", "Limited"],
      allowedOfficerRoles: ["DIRECTOR", "SECRETARY"],
      officerRequirements: [
        { role: "DIRECTOR", min: 1, message: "A private limited company needs at least one director." },
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
        "ARTICLES_OF_ASSOCIATION",
        "SHAREHOLDER_REGISTER",
        "SHARE_CERTIFICATE",
        "CONSENT_TO_ACT",
      ],
      governmentFee: 50_00,
      processingTime: { standard: "Usually within 24 hours" },
      popular: true,
    },
  ],
  address: {
    regionLabel: "Country",
    regions: [
      { code: "ENG", name: "England" },
      { code: "WLS", name: "Wales" },
      { code: "SCT", name: "Scotland" },
      { code: "NIR", name: "Northern Ireland" },
    ],
    postcodeLabel: "Postcode",
    postcodePattern: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
    postcodeExample: "SW1A 1AA",
    requiresPhysicalAddress: true,
    hasPrincipalPlaceOfBusiness: false,
    registeredAgent: "unavailable",
    virtualOfficeAvailable: true,
  },
  people: {
    directorMinimumAge: 16,
    requiresDirectorId: false,
    requiresPlaceOfBirth: false,
    requiresDateOfBirth: true,
    beneficialOwnership: {
      label: "Persons with Significant Control (PSC)",
      shortLabel: "PSC",
      thresholdPercent: 25,
      required: true,
      natureOfControlOptions: [
        { value: "OWNERSHIP_OF_SHARES_25_TO_50", label: "Owns more than 25% but not more than 50% of shares" },
        { value: "OWNERSHIP_OF_SHARES_50_TO_75", label: "Owns more than 50% but less than 75% of shares" },
        { value: "OWNERSHIP_OF_SHARES_75_TO_100", label: "Owns 75% or more of shares" },
        { value: "VOTING_RIGHTS_25_TO_50", label: "Holds more than 25% of voting rights" },
        { value: "RIGHT_TO_APPOINT_DIRECTORS", label: "Can appoint or remove a majority of directors" },
        { value: "SIGNIFICANT_INFLUENCE_OR_CONTROL", label: "Has significant influence or control" },
      ],
    },
  },
  requiresSicCodes: true,
  serviceTax: { label: "VAT", rate: 0.2 },
  compliance: [
    {
      type: "CONFIRMATION_STATEMENT",
      title: "Confirmation statement",
      description: "Confirm company details with Companies House at least once every 12 months (14 days' grace).",
      schedule: { kind: "anniversary", offsetDays: 14 },
      feeEstimate: 50_00,
    },
    {
      type: "TAX_RETURN",
      title: "Annual accounts",
      description:
        "First accounts are due 21 months after incorporation, then 9 months after each financial year end.",
      schedule: { kind: "months-after-incorporation", months: 21, thenYearly: true },
    },
  ],
  help: {
    physicalAddress: {
      title: "Why do I need a physical address?",
      body: "Your registered office must be a physical address in the same UK country the company is registered in (e.g. England & Wales). It's publicly visible — use our registered office service to keep your home address private.",
    },
    psc: {
      title: "What is a PSC?",
      body: "A Person with Significant Control is anyone who owns more than 25% of shares or voting rights, can appoint the board, or otherwise controls the company. Companies House publishes the PSC register.",
    },
    personalCode: {
      title: "Companies House personal code",
      body: "Directors and PSCs must verify their identity with Companies House (via GOV.UK One Login or an authorised agent) and give the 11-character personal code. Add it now if you have it — otherwise we'll help you verify before we lodge.",
    },
    sic: {
      title: "What is a SIC code?",
      body: "Standard Industrial Classification codes describe what your company does. Choose 1–4 codes; you can change them later with your confirmation statement.",
    },
    companyNumber: {
      title: "What is a company number?",
      body: "The unique 8-character number Companies House issues on incorporation, e.g. 12345678. It must appear on your website, invoices and letters.",
    },
    shares: {
      title: "How many shares should I issue?",
      body: "Most small companies issue 100 ordinary shares at £1 each. Share capital is the amount shareholders are liable for if the company is wound up.",
    },
  },
};

/** A pragmatic subset of UK SIC 2007 codes for the wizard. */
export const SIC_CODES: { code: string; label: string }[] = [
  { code: "62012", label: "Business and domestic software development" },
  { code: "62020", label: "Information technology consultancy activities" },
  { code: "62090", label: "Other information technology service activities" },
  { code: "63120", label: "Web portals" },
  { code: "47910", label: "Retail sale via mail order houses or via Internet" },
  { code: "70229", label: "Management consultancy activities (other than financial)" },
  { code: "73110", label: "Advertising agencies" },
  { code: "74100", label: "Specialised design activities" },
  { code: "74909", label: "Other professional, scientific and technical activities n.e.c." },
  { code: "56101", label: "Licensed restaurants" },
  { code: "68209", label: "Other letting and operating of own or leased real estate" },
  { code: "41100", label: "Development of building projects" },
  { code: "85590", label: "Other education n.e.c." },
  { code: "86900", label: "Other human health activities" },
  { code: "96090", label: "Other service activities n.e.c." },
  { code: "99999", label: "Dormant company" },
];
