import { createHash, randomInt } from "node:crypto";
import type { Address } from "@/lib/validation/address";
import type { FormationPayload } from "@/lib/registry/types";
import { el, xmlBlocks, xmlText } from "./xml";

/**
 * Companies House XML Gateway client (software filing).
 * Spec: "XML Gateway Technical Interface Specification" + CompanyIncorporation schema.
 *
 * IMPORTANT: the CompanyIncorporation body below follows the published schema
 * structure, but element order and optional elements must be validated against
 * the current XSD with CH test presenter credentials (GatewayTest=1) before
 * enabling in production (CH_XML_GATEWAY_ENABLED=1).
 */

type Fetch = typeof fetch;

export interface GatewayConfig {
  presenterId: string;
  presenterAuth: string;
  email: string;
  packageReference: string;
  url: string;
  test: boolean;
}

export function gatewayConfigFromEnv(): GatewayConfig | undefined {
  const { CH_PRESENTER_ID, CH_PRESENTER_AUTH, CH_XML_GATEWAY_ENABLED } = process.env;
  if (CH_XML_GATEWAY_ENABLED !== "1" || !CH_PRESENTER_ID || !CH_PRESENTER_AUTH) return undefined;
  return {
    presenterId: CH_PRESENTER_ID,
    presenterAuth: CH_PRESENTER_AUTH,
    email: process.env.CH_PRESENTER_EMAIL ?? process.env.OPS_EMAIL ?? "filings@example.com",
    packageReference: process.env.CH_PACKAGE_REFERENCE ?? "0012",
    url: process.env.CH_XML_GATEWAY_URL ?? "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway",
    test: process.env.CH_GATEWAY_TEST !== "0",
  };
}

const md5 = (value: string) => createHash("md5").update(value).digest("hex");

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export function envelope(config: GatewayConfig, messageClass: string, body: string, transactionId = String(randomInt(1, 2 ** 31))): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${[
    el("EnvelopeVersion", "1.0"),
    el("Header", [
      el("MessageDetails", [el("Class", messageClass), el("Qualifier", "request"), el("TransactionID", transactionId), el("GatewayTest", config.test ? "1" : "0")]),
      el("SenderDetails", [
        el("IDAuthentication", [
          el("SenderID", md5(config.presenterId)),
          el("Authentication", [el("Method", "CHMD5"), el("Value", md5(config.presenterAuth))]),
        ]),
        el("EmailAddress", config.email),
      ]),
    ]),
    `<GovTalkDetails><Keys/></GovTalkDetails>`,
    `<Body>${body}</Body>`,
  ].join("")}</GovTalkMessage>`;
}

/** Throws on GovTalk-level errors (authentication, schema, gateway faults). */
export function checkResponse(xml: string): void {
  const errors = xmlBlocks(xml, "Error");
  const qualifier = xmlText(xml, "Qualifier");
  if (qualifier === "error" || errors.length) {
    const first = errors[0] ?? "";
    const number = xmlText(first, "Number") ?? "?";
    const text = xmlText(first, "Text") ?? "Unknown gateway error";
    const type = xmlText(first, "Type") ?? "";
    // Business/fatal errors won't succeed on retry; recoverable/system ones may.
    throw new GatewayError(`Companies House gateway error ${number}: ${text}`, /recoverable|system/i.test(type));
  }
}

export async function send(config: GatewayConfig, xml: string, fetchImpl: Fetch = fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(config.url, { method: "POST", headers: { "Content-Type": "text/xml; charset=UTF-8" }, body: xml, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new GatewayError(`Companies House gateway unreachable: ${error instanceof Error ? error.message : error}`, true);
  }
  const text = await res.text();
  if (!res.ok) throw new GatewayError(`Companies House gateway HTTP ${res.status}`, res.status >= 500);
  checkResponse(text);
  return text;
}

// ─── CompanyIncorporation form ──────────────────────────────────────────────

const NATIONALITY: Record<string, string> = {
  GB: "British", AU: "Australian", US: "American", IE: "Irish", CA: "Canadian", NZ: "New Zealander", IN: "Indian",
  DE: "German", FR: "French", ES: "Spanish", IT: "Italian", NL: "Dutch", SG: "Singaporean", HK: "Chinese", CN: "Chinese",
  JP: "Japanese", ZA: "South African", NG: "Nigerian", AE: "Emirati", BR: "Brazilian",
};

const NATURE_OF_CONTROL: Record<string, string> = {
  OWNERSHIP_OF_SHARES_25_TO_50: "OWNERSHIPOFSHARES_25TO50PERCENT",
  OWNERSHIP_OF_SHARES_50_TO_75: "OWNERSHIPOFSHARES_50TO75PERCENT",
  OWNERSHIP_OF_SHARES_75_TO_100: "OWNERSHIPOFSHARES_75TO100PERCENT",
  VOTING_RIGHTS_25_TO_50: "VOTINGRIGHTS_25TO50PERCENT",
  RIGHT_TO_APPOINT_DIRECTORS: "RIGHTTOAPPOINTANDREMOVEDIRECTORS",
  SIGNIFICANT_INFLUENCE_OR_CONTROL: "SIGINFLUENCECONTROL",
};

const COUNTRY_OF_INCORPORATION: Record<string, string> = { ENG: "EW", WLS: "WA", SCT: "SC", NIR: "NI" };
const OFFICE_COUNTRY: Record<string, string> = { ENG: "GB-ENG", WLS: "GB-WLS", SCT: "GB-SCT", NIR: "GB-NIR" };

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  const surname = parts.pop() ?? fullName;
  return { forenames: parts, surname };
}

function personName(fullName: string): string[] {
  const { forenames, surname } = splitName(fullName);
  return [el("Forename", forenames[0] ?? surname), forenames.length > 1 ? el("OtherForenames", forenames.slice(1).join(" ")) : undefined, el("Surname", surname)].filter(Boolean) as string[];
}

function address(a: Address, countryOverride?: string): string {
  const match = /^(\S*\d\S*)\s+(.*)$/.exec(a.line1.trim());
  const premise = match ? match[1]! : a.line1.trim();
  const street = match ? match[2]! : a.line2?.trim() || undefined;
  return [
    el("Premise", premise),
    el("Street", street),
    el("Thoroughfare", match ? a.line2?.trim() : undefined),
    el("PostTown", a.city),
    el("Country", countryOverride ?? (a.country === "GB" ? OFFICE_COUNTRY[a.region] ?? "GB" : a.country)),
    el("Postcode", a.postcode),
  ].join("");
}

/** Whether a payload carries everything electronic incorporation needs (otherwise staff lodge it). */
export function missingForElectronicFiling(payload: FormationPayload): string[] {
  const missing: string[] = [];
  payload.officers
    .filter((o) => o.roles.includes("DIRECTOR") && !o.identityVerificationCode)
    .forEach((o) => missing.push(`Companies House personal code for director ${o.fullName}`));
  payload.beneficialOwners
    .filter((b) => !b.identityVerificationCode)
    .forEach((b) => missing.push(`Companies House personal code for PSC ${b.fullName}`));
  return missing;
}

/**
 * @param articlesPdf our bespoke articles (they amend the model articles), attached
 *   to the submission. Validate the attachment element names against the XSD.
 */
export function incorporationBody(
  payload: FormationPayload,
  config: GatewayConfig,
  submissionNumber: string,
  today = new Date(),
  articlesPdf?: Uint8Array,
): string {
  const office = payload.registeredOffice;
  const shares = payload.shareholders;
  const classes = [...new Set(shares.map((s) => s.shareClass))];
  const capital = classes.map((cls) => {
    const inClass = shares.filter((s) => s.shareClass === cls);
    const num = inClass.reduce((acc, s) => acc + s.units, 0);
    const nominal = inClass.reduce((acc, s) => acc + s.units * s.pricePerUnit, 0);
    return el("Shares", [
      el("ShareClass", cls),
      el("PrescribedParticulars", "Each share carries one vote and an equal right to dividends and to capital on a winding up. Shares are not redeemable."),
      el("NumShares", String(num)),
      el("AggregateNominalValue", nominal.toFixed(2)),
    ]);
  });
  const totalShares = shares.reduce((acc, s) => acc + s.units, 0);
  const totalNominal = shares.reduce((acc, s) => acc + s.units * s.pricePerUnit, 0);

  const form = el(
    "CompanyIncorporation",
    [
      el("CompanyType", "BYSHR"),
      el("CountryOfIncorporation", COUNTRY_OF_INCORPORATION[office.region] ?? "EW"),
      el("RegisteredOfficeAddress", [address(office)]),
      el("RegisteredEmailAddress", payload.registeredEmail),
      el("LawfulPurposeStatement", payload.lawfulPurposeStatement ? "true" : undefined),
      el("DataMemorandum", "true"),
      el("Articles", articlesPdf ? "BESPOKE" : "MODEL"),
      el("RestrictedArticles", "false"),
      ...payload.officers.flatMap((o) =>
        o.roles
          .filter((r) => r === "DIRECTOR" || r === "SECRETARY")
          .map((role) =>
            el("Appointment", [
              el("ConsentToAct", "true"),
              el(role === "DIRECTOR" ? "Director" : "Secretary", [
                el("Person", [
                  ...personName(o.fullName),
                  el("ServiceAddress", [el("SameAsRegisteredOffice", "true")]),
                  role === "DIRECTOR" ? el("DOB", o.dateOfBirth) : undefined,
                  role === "DIRECTOR" ? el("Nationality", NATIONALITY[o.nationality ?? ""] ?? o.nationality) : undefined,
                  role === "DIRECTOR" ? el("Occupation", "Company Director") : undefined,
                  role === "DIRECTOR" ? el("CountryOfResidence", o.residentialAddress.country === "GB" ? "United Kingdom" : o.residentialAddress.country) : undefined,
                  role === "DIRECTOR" ? el("ResidentialAddress", [el("Address", [address(o.residentialAddress, o.residentialAddress.country)])]) : undefined,
                  el("PersonalCode", o.identityVerificationCode),
                ]),
              ]),
            ]),
          ),
      ),
      payload.beneficialOwners.length
        ? el(
            "PSCs",
            payload.beneficialOwners.map((b) =>
              el("PSC", [
                el("PSCNotification", [
                  el("Individual", [
                    ...personName(b.fullName),
                    el("ServiceAddress", [el("SameAsRegisteredOffice", "true")]),
                    el("DOB", b.dateOfBirth),
                    el("Nationality", NATIONALITY[b.nationality ?? ""] ?? b.nationality),
                    el("CountryOfResidence", b.residentialAddress.country === "GB" ? "United Kingdom" : b.residentialAddress.country),
                    el("ResidentialAddress", [address(b.residentialAddress, b.residentialAddress.country)]),
                    el("PersonalCode", b.identityVerificationCode),
                  ]),
                  el("NatureOfControls", b.natureOfControl.map((n) => el("NatureOfControl", NATURE_OF_CONTROL[n] ?? n))),
                ]),
              ]),
            ),
          )
        : el("PSCs", [el("NoPSCStatement", "NOPSC")]),
      el("StatementOfCapital", [
        el("Capital", [
          el("TotalAmountUnpaid", "0"),
          el("TotalNumberOfIssuedShares", String(totalShares)),
          el("ShareCurrency", "GBP"),
          el("TotalAggregateNominalValue", totalNominal.toFixed(2)),
          ...capital,
        ]),
      ]),
      ...shares.map((s) =>
        el("Subscribers", [
          s.holderType === "CORPORATE" ? el("Corporate", [el("CorporateName", s.fullName)]) : el("Person", personName(s.fullName)),
          el("Address", [address(s.address, s.address.country)]),
          el("Allotment", [
            el("ShareClass", s.shareClass),
            el("NumShares", String(s.units)),
            el("AmountPaidDuePerShare", s.pricePerUnit.toFixed(2)),
            el("AmountUnpaidPerShare", "0"),
            el("ShareCurrency", "GBP"),
            el("ShareValue", s.pricePerUnit.toFixed(2)),
          ]),
          el("MemorandumStatement", "Each subscriber to this memorandum of association wishes to form a company under the Companies Act 2006 and agrees to become a member of the company and to take at least one share."),
        ]),
      ),
      el("Authoriser", [el("Agent", [el("Corporate", [el("Forename", "GlobalCorp"), el("Surname", "Hub")])])]),
      el("SameDay", payload.expedited ? "true" : "false"),
      el("SICCodes", payload.sicCodes.map((c) => el("SICCode", c))),
    ],
    { xmlns: "http://xmlgw.companieshouse.gov.uk" },
  );

  return el(
    "FormSubmission",
    [
      el("FormHeader", [
        el("CompanyName", payload.companyName.toUpperCase()),
        el("PackageReference", config.packageReference),
        el("FormIdentifier", "CompanyIncorporation"),
        el("SubmissionNumber", submissionNumber),
      ]),
      el("DateSigned", today.toISOString().slice(0, 10)),
      `<Form>${form}</Form>`,
      articlesPdf
        ? el("Document", [
            el("Data", Buffer.from(articlesPdf).toString("base64")),
            el("Date", today.toISOString().slice(0, 10)),
            el("Filename", "articles-of-association.pdf"),
            el("ContentType", "application/pdf"),
            el("Category", "MEMARTS"),
          ])
        : undefined,
    ],
    { xmlns: "http://xmlgw.companieshouse.gov.uk/Header" },
  );
}

export interface SubmissionStatus {
  statusCode: "ACCEPT" | "REJECT" | "PENDING" | "PARKED" | "INTERNAL_FAILURE" | string;
  rejections: { code: string; description: string }[];
  incorporation?: { companyNumber: string; incorporationDate: string; authenticationCode?: string; docRequestKey?: string };
  examinerComment?: string;
}

export function statusBody(config: GatewayConfig, submissionNumber: string): string {
  return el("GetSubmissionStatus", [el("SubmissionNumber", submissionNumber), el("PresenterID", config.presenterId)], { xmlns: "http://xmlgw.companieshouse.gov.uk" });
}

export function parseSubmissionStatus(xml: string): SubmissionStatus {
  const status = xmlBlocks(xml, "Status")[0] ?? xml;
  const inc = xmlBlocks(status, "IncorporationDetails")[0];
  return {
    statusCode: xmlText(status, "StatusCode") ?? "PENDING",
    rejections: xmlBlocks(status, "Reject").map((r) => ({ code: xmlText(r, "RejectCode") ?? "", description: xmlText(r, "Description") ?? "" })),
    examinerComment: xmlText(status, "ExaminerComment"),
    incorporation: inc
      ? {
          companyNumber: xmlText(inc, "CompanyNumber") ?? "",
          incorporationDate: xmlText(inc, "IncorporationDate") ?? "",
          authenticationCode: xmlText(inc, "AuthenticationCode"),
          docRequestKey: xmlText(inc, "DocRequestKey"),
        }
      : undefined,
  };
}

export function documentBody(docRequestKey: string): string {
  return el("GetDocument", [el("DocRequestKey", docRequestKey)], { xmlns: "http://xmlgw.companieshouse.gov.uk" });
}

/** Base64 PDF from a GetDocument response. */
export function parseDocument(xml: string): Uint8Array {
  const data = xmlText(xml, "DocumentData") ?? xmlText(xml, "Data");
  if (!data) throw new GatewayError("GetDocument response contained no document", false);
  return new Uint8Array(Buffer.from(data.replace(/\s+/g, ""), "base64"));
}

/** Six-character alphanumeric submission number, unique per presenter. */
export function newSubmissionNumber(): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
}
