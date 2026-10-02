import type { Jurisdiction } from "@/lib/domain";
import { stripLegalEnding } from "@/lib/names";
import type { RegisterEntry } from "@/lib/registry/name-evaluation";
import { db } from "../db";

type Fetch = typeof fetch;

/** A searchable company register (official API or our own records). */
export interface NameSearchProvider {
  readonly name: string;
  /** Whether this provider queries the authority's own register. */
  readonly authoritative: boolean;
  search(query: string, jurisdiction: Jurisdiction): Promise<RegisterEntry[]>;
}

/**
 * Companies House Public Data API — https://developer.company-information.service.gov.uk
 * Free API key, HTTP Basic auth with the key as username. Dissolved companies are
 * ignored because their names can be reused.
 */
export class CompaniesHouseSearch implements NameSearchProvider {
  readonly name = "Companies House";
  readonly authoritative = true;
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly baseUrl = "https://api.company-information.service.gov.uk",
  ) {}

  async search(query: string): Promise<RegisterEntry[]> {
    const url = `${this.baseUrl}/search/companies?${new URLSearchParams({ q: stripLegalEnding(query), items_per_page: "50" })}`;
    const res = await this.fetchImpl(url, {
      headers: { Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Companies House search failed (${res.status})`);
    const body = (await res.json()) as { items?: { title?: string; company_number?: string; company_status?: string }[] };
    return (body.items ?? [])
      .filter((i) => i.title && i.company_status !== "dissolved")
      .map((i) => ({ name: i.title!, number: i.company_number ?? "" }));
  }
}

/**
 * ABN Lookup web service (Australian Business Register) — https://abr.business.gov.au/Tools/WebServices
 * Free GUID. Searches entity (company) names and business names, which ASIC's
 * identical-name rules also cover. The JSON endpoint answers with JSONP.
 */
export class AbnLookupSearch implements NameSearchProvider {
  readonly name = "ABN Lookup";
  readonly authoritative = true;
  constructor(
    private readonly guid: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly baseUrl = "https://abr.business.gov.au",
  ) {}

  async search(query: string): Promise<RegisterEntry[]> {
    const params = new URLSearchParams({ name: stripLegalEnding(query), maxResults: "50", guid: this.guid, callback: "cb" });
    const res = await this.fetchImpl(`${this.baseUrl}/json/MatchingNames.aspx?${params}`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`ABN Lookup failed (${res.status})`);
    const text = await res.text();
    const json = JSON.parse(text.replace(/^[^(]*\(/, "").replace(/\);?\s*$/, "")) as {
      Message?: string;
      Names?: { Abn?: string; Name?: string; NameType?: string; IsCurrent?: boolean }[];
    };
    if (json.Message) throw new Error(`ABN Lookup: ${json.Message}`);
    return (json.Names ?? [])
      .filter((n) => n.Name && n.IsCurrent !== false && n.NameType !== "Trading Name")
      .map((n) => ({ name: n.Name!, number: n.Abn ? `ABN ${n.Abn}` : "" }));
  }
}

/** Companies formed or in progress through this platform (catches clashes the authority doesn't know about yet). */
export class PlatformRegisterSearch implements NameSearchProvider {
  readonly name = "GlobalCorp Hub";
  readonly authoritative = false;

  async search(query: string, jurisdiction: Jurisdiction): Promise<RegisterEntry[]> {
    const word = stripLegalEnding(query).split(/\s+/)[0] ?? query;
    const companies = await db().company.findMany({
      where: {
        jurisdiction,
        status: { notIn: ["REJECTED", "DEREGISTERED"] },
        filings: { some: { status: { not: "DRAFT" } } },
        OR: [{ proposedName: { contains: word, mode: "insensitive" } }, { legalName: { contains: word, mode: "insensitive" } }],
      },
      select: { proposedName: true, legalName: true, registryNumber: true },
      take: 50,
    });
    return companies.map((c) => ({ name: c.legalName ?? c.proposedName, number: c.registryNumber ?? "pending" }));
  }
}
