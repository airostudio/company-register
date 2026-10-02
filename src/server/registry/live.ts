import type { IGovernmentRegistryAdapter } from "@/lib/registry/types";
import { AssistedLodgementAdapter } from "./assisted";
import { CompaniesHouseLiveAdapter } from "./companies-house";
import { AbnLookupSearch, CompaniesHouseSearch, PlatformRegisterSearch, type NameSearchProvider } from "./name-search";

/**
 * Live registry adapters. Each official integration switches on when its
 * credentials are present; anything without an API is lodged by staff
 * through the ops console (assisted lodgement).
 *
 *   AU    ABN Lookup name search (ABN_LOOKUP_GUID) + assisted ASIC lodgement
 *   US    our own register + assisted Delaware / Wyoming filing
 *   UK    Companies House search (COMPANIES_HOUSE_API_KEY) + XML Gateway
 *         (CH_XML_GATEWAY_ENABLED=1, CH_PRESENTER_ID, CH_PRESENTER_AUTH) or assisted
 */
export function createLiveAdapters(): IGovernmentRegistryAdapter[] {
  const platform = new PlatformRegisterSearch();
  const withOfficial = (official: NameSearchProvider | undefined) => (official ? [official, platform] : [platform]);

  const { ABN_LOOKUP_GUID, COMPANIES_HOUSE_API_KEY } = process.env;
  return [
    new AssistedLodgementAdapter("ASIC", ["AU"], withOfficial(ABN_LOOKUP_GUID ? new AbnLookupSearch(ABN_LOOKUP_GUID) : undefined)),
    new AssistedLodgementAdapter("US-SOS", ["US_DE", "US_WY"], withOfficial(undefined)),
    new CompaniesHouseLiveAdapter(withOfficial(COMPANIES_HOUSE_API_KEY ? new CompaniesHouseSearch(COMPANIES_HOUSE_API_KEY) : undefined)),
  ];
}
