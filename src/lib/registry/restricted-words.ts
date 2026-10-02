import type { Jurisdiction } from "@/lib/domain";
import type { RestrictedWord } from "./name-evaluation";

/** Words that need regulator consent. Shown as warnings; staff/registries make the final call. */
export const RESTRICTED_WORDS: Record<Jurisdiction, readonly RestrictedWord[]> = {
  AU: [
    { word: "bank", reason: "requires APRA approval under the Banking Act 1959." },
    { word: "university", reason: "requires approval from the relevant education minister." },
    { word: "anzac", reason: "requires approval from the Minister for Veterans' Affairs." },
    { word: "royal", reason: "suggests a royal connection and requires consent." },
    { word: "chartered", reason: "suggests a professional charter and requires consent." },
  ],
  US_DE: [
    { word: "bank", reason: "requires approval from the State Bank Commissioner." },
    { word: "insurance", reason: "requires approval from the Department of Insurance." },
    { word: "trust", reason: "may imply a trust company and require banking approval." },
    { word: "university", reason: "requires Department of Education approval." },
    { word: "cooperative", reason: "is reserved for cooperative associations." },
  ],
  US_WY: [
    { word: "bank", reason: "requires approval from the Wyoming Division of Banking." },
    { word: "insurance", reason: "requires approval from the Department of Insurance." },
    { word: "trust", reason: "may imply a trust company and require banking approval." },
    { word: "university", reason: "requires Department of Education approval." },
    { word: "cooperative", reason: "is reserved for cooperative associations." },
  ],
  UK: [
    { word: "royal", reason: "is a sensitive word that needs Cabinet Office consent." },
    { word: "british", reason: "is a sensitive word that implies national pre-eminence." },
    { word: "national", reason: "is a sensitive word that implies national pre-eminence." },
    { word: "bank", reason: "requires consent from the Prudential Regulation Authority." },
    { word: "charity", reason: "requires Charity Commission consent." },
    { word: "university", reason: "requires Department for Education consent." },
    { word: "government", reason: "implies a connection with government." },
  ],
};
