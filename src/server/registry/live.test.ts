import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildFormationPayload } from "@/lib/registry/payload";
import { buildApplication } from "@/test/fixtures";
import { CompaniesHouseLiveAdapter } from "./companies-house";
import {
  checkResponse,
  envelope,
  incorporationBody,
  missingForElectronicFiling,
  parseSubmissionStatus,
  type GatewayConfig,
} from "./companies-house-gateway";
import { AbnLookupSearch, CompaniesHouseSearch } from "./name-search";

const config: GatewayConfig = {
  presenterId: "66666959491",
  presenterAuth: "TESTAUTH1",
  email: "filings@example.com",
  packageReference: "0012",
  url: "https://xmlgw.test/gateway",
  test: true,
};
const md5 = (v: string) => createHash("md5").update(v).digest("hex");

function ukPayload(withCodes = true) {
  const app = buildApplication("UK", "UK_LTD", "Thames & Severn <Robotics>");
  if (withCodes) {
    app.people.officers.forEach((o) => (o.identityVerificationCode = "ABC12345DEF"));
    app.people.beneficialOwners.forEach((b) => (b.identityVerificationCode = "XYZ98765QRS"));
  }
  return buildFormationPayload(app, "filing_1");
}

function fakeFetch(handler: (url: string, body: string) => { status?: number; body: string }) {
  const calls: { url: string; body: string }[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ url: String(url), body });
    const r = handler(String(url), body);
    return new Response(r.body, { status: r.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

describe("name search providers", () => {
  it("Companies House search authenticates with the API key and skips dissolved companies", async () => {
    const { impl, calls } = fakeFetch(() => ({
      body: JSON.stringify({
        items: [
          { title: "ACME WIDGETS LTD", company_number: "01234567", company_status: "active" },
          { title: "ACME OLD LTD", company_number: "07654321", company_status: "dissolved" },
        ],
      }),
    }));
    const results = await new CompaniesHouseSearch("key123", impl, "https://ch.test").search("Acme Widgets Ltd");
    expect(results).toEqual([{ name: "ACME WIDGETS LTD", number: "01234567" }]);
    expect(calls[0]!.url).toBe("https://ch.test/search/companies?q=Acme+Widgets&items_per_page=50");
  });

  it("ABN Lookup parses the JSONP response and ignores trading names", async () => {
    const { impl, calls } = fakeFetch(() => ({
      body: 'cb({"Message":"","Names":[{"Abn":"51824753556","IsCurrent":true,"Name":"CANVA PTY LTD","NameType":"Entity Name"},{"Abn":"1","IsCurrent":true,"Name":"CANVA CAFE","NameType":"Trading Name"}]})',
    }));
    const results = await new AbnLookupSearch("guid-1", impl, "https://abr.test").search("Canva Pty Ltd");
    expect(results).toEqual([{ name: "CANVA PTY LTD", number: "ABN 51824753556" }]);
    expect(calls[0]!.url).toContain("name=Canva");
    expect(calls[0]!.url).toContain("guid=guid-1");
  });

  it("ABN Lookup surfaces API errors", async () => {
    const { impl } = fakeFetch(() => ({ body: 'cb({"Message":"The GUID entered is not recognised as a Registered Party","Names":[]})' }));
    await expect(new AbnLookupSearch("bad", impl).search("x")).rejects.toThrow(/not recognised/);
  });
});

describe("Companies House XML Gateway", () => {
  it("builds a GovTalk envelope with CHMD5 authentication", () => {
    const xml = envelope(config, "GetSubmissionStatus", "<X/>", "42");
    expect(xml).toContain(`<SenderID>${md5(config.presenterId)}</SenderID>`);
    expect(xml).toContain(`<Method>CHMD5</Method><Value>${md5(config.presenterAuth)}</Value>`);
    expect(xml).toContain("<Class>GetSubmissionStatus</Class>");
    expect(xml).toContain("<GatewayTest>1</GatewayTest>");
    expect(xml).toContain("<Body><X/></Body>");
  });

  it("builds the incorporation form, escaping user input", () => {
    const body = incorporationBody(ukPayload(), config, "A1B2C3", new Date("2026-10-02T00:00:00Z"));
    expect(body).toContain("<CompanyName>THAMES &amp; SEVERN &lt;ROBOTICS&gt; LTD</CompanyName>");
    expect(body).toContain("<FormIdentifier>CompanyIncorporation</FormIdentifier><SubmissionNumber>A1B2C3</SubmissionNumber>");
    expect(body).toContain("<CompanyType>BYSHR</CompanyType><CountryOfIncorporation>EW</CountryOfIncorporation>");
    expect(body).toContain("<Premise>10</Premise><Street>Downing Street</Street>");
    expect(body).toContain("<NatureOfControl>OWNERSHIPOFSHARES_25TO50PERCENT</NatureOfControl>");
    expect(body).toContain("<TotalNumberOfIssuedShares>100</TotalNumberOfIssuedShares>");
    expect(body).toContain("<PersonalCode>ABC12345DEF</PersonalCode>");
    expect(body).toContain("<SICCode>62012</SICCode>");
    expect(body).toContain("<RegisteredEmailAddress>company@example.com</RegisteredEmailAddress><LawfulPurposeStatement>true</LawfulPurposeStatement>");
    expect(body).not.toMatch(/<[A-Za-z]+><\/[A-Za-z]+>/); // no empty elements
  });

  it("requires personal codes for electronic filing", () => {
    expect(missingForElectronicFiling(ukPayload())).toEqual([]);
    expect(missingForElectronicFiling(ukPayload(false))).toHaveLength(3);
  });

  it("raises GovTalk errors", () => {
    const error = `<GovTalkMessage><Header><MessageDetails><Qualifier>error</Qualifier></MessageDetails></Header><GovTalkDetails><GovTalkErrors><Error><RaisedBy>CH</RaisedBy><Number>502</Number><Type>fatal</Type><Text>Authorisation Failure</Text></Error></GovTalkErrors></GovTalkDetails></GovTalkMessage>`;
    expect(() => checkResponse(error)).toThrow("Companies House gateway error 502: Authorisation Failure");
  });

  it("parses accepted and rejected submission statuses", () => {
    const accepted = parseSubmissionStatus(
      `<SubmissionStatus><Status><SubmissionNumber>A1B2C3</SubmissionNumber><StatusCode>ACCEPT</StatusCode><IncorporationDetails><DocRequestKey>KEY1</DocRequestKey><IncorporationDate>2026-10-03</IncorporationDate><AuthenticationCode>XYZ123</AuthenticationCode><CompanyNumber>16123456</CompanyNumber></IncorporationDetails></Status></SubmissionStatus>`,
    );
    expect(accepted).toMatchObject({ statusCode: "ACCEPT", incorporation: { companyNumber: "16123456", docRequestKey: "KEY1", incorporationDate: "2026-10-03" } });
    const rejected = parseSubmissionStatus(
      `<Status><StatusCode>REJECT</StatusCode><Rejections><Reject><RejectCode>9000</RejectCode><Description>Name &amp; company already exists</Description></Reject></Rejections></Status>`,
    );
    expect(rejected.rejections).toEqual([{ code: "9000", description: "Name & company already exists" }]);
  });

  it("submits, polls to approval and fetches the certificate", async () => {
    const pdf = Buffer.from("%PDF-1.4 certificate").toString("base64");
    const { impl, calls } = fakeFetch((_url, body) => {
      if (body.includes("<Class>CompanyIncorporation</Class>")) return { body: "<GovTalkMessage><Header><MessageDetails><Qualifier>response</Qualifier></MessageDetails></Header><Body/></GovTalkMessage>" };
      if (body.includes("<Class>GetSubmissionStatus</Class>"))
        return { body: "<Body><SubmissionStatus><Status><StatusCode>ACCEPT</StatusCode><IncorporationDetails><DocRequestKey>K</DocRequestKey><IncorporationDate>2026-10-03</IncorporationDate><CompanyNumber>16123456</CompanyNumber></IncorporationDetails></Status></SubmissionStatus></Body>" };
      return { body: `<Body><Document><DocumentData>${pdf}</DocumentData></Document></Body>` };
    });
    const adapter = new CompaniesHouseLiveAdapter([], config, impl);
    const receipt = await adapter.submitFiling(ukPayload());
    expect(receipt.filingId).toMatch(/^CH-XML-[0-9A-Z]{6}$/);
    expect(adapter.ownsReference(receipt.filingId)).toBe(true);
    const status = await adapter.pollFilingStatus(receipt.filingId);
    expect(status).toMatchObject({ status: "APPROVED", registration: { registryNumber: "16123456", incorporatedAt: "2026-10-03T00:00:00.000Z" } });
    const [doc] = await adapter.downloadOfficialDocuments(receipt.filingId);
    expect(Buffer.from(doc!.content).toString()).toBe("%PDF-1.4 certificate");
    expect(calls).toHaveLength(4);
    expect(calls[0]!.body).toContain("<Articles>BESPOKE</Articles>");
    expect(calls[0]!.body).toMatch(/<Document><Data>JVBERi0[A-Za-z0-9+/=]+<\/Data>.*<Category>MEMARTS<\/Category><\/Document>/);
  });
});
