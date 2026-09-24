/**
 * Company-name normalisation shared by the wizard and the registry adapters.
 *
 * Registries compare names after stripping the legal ending, punctuation and
 * "noise" words, so "The Acme Co. Pty Ltd" and "ACME PTY LIMITED" collide.
 */

const LEGAL_ENDINGS = [
  "proprietary limited",
  "pty\\.? ltd\\.?",
  "pty\\.? limited",
  "limited liability company",
  "l\\.l\\.c\\.?",
  "llc",
  "incorporated",
  "inc\\.?",
  "corporation",
  "corp\\.?",
  "limited",
  "ltd\\.?",
];

/** Matches a legal ending at the end of a name, e.g. "Acme Pty Ltd" → "Pty Ltd". */
export const LEGAL_ENDING_REGEX = new RegExp(`(?:^|\\s)(${LEGAL_ENDINGS.join("|")})\\s*$`, "i");

/** Characters accepted by all three registries (letters incl. accents, digits, common punctuation). */
export const COMPANY_NAME_CHARS = /^[\p{L}\p{N} &'’.,\-()!?@+/:]+$/u;

export function stripLegalEnding(name: string): string {
  return name.replace(LEGAL_ENDING_REGEX, "").trim();
}

const NOISE_WORDS = new Set(["the", "and", "co", "company", "group", "holdings", "au", "uk", "us", "usa"]);

/**
 * Canonical comparison key. "The Acme & Co. Pty Ltd" → "acme".
 * Noise words are dropped only if something meaningful remains.
 */
export function normalizeCompanyName(name: string): string {
  const cleaned = stripLegalEnding(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean);
  const meaningful = words.filter((w) => !NOISE_WORDS.has(w));
  return (meaningful.length > 0 ? meaningful : words).join(" ");
}

/** Levenshtein-based similarity in [0, 1]. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeCompanyName(a);
  const y = normalizeCompanyName(b);
  if (x === y) return 1;
  if (!x.length || !y.length) return 0;
  const prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const temp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return 1 - prev[y.length]! / Math.max(x.length, y.length);
}
