import type { Jurisdiction } from "@/lib/domain";
import { composeCompanyName, getJurisdiction } from "@/lib/jurisdictions";
import { COMPANY_NAME_CHARS, LEGAL_ENDING_REGEX, nameSimilarity, normalizeCompanyName, stripLegalEnding } from "@/lib/names";
import type { NameAvailabilityResult, NameIssue } from "./types";

export interface RegisterEntry {
  name: string;
  number: string;
}

export interface RestrictedWord {
  word: string;
  reason: string;
}

/** Names at or above this similarity are reported; 1 means identical after normalisation. */
const SIMILARITY_THRESHOLD = 0.82;

/**
 * Registry-independent name rules, shared by the mock simulators and the live
 * adapters: character set, legal ending, identical/similar names on the
 * register, restricted words, and suggestions that don't clash.
 */
export function evaluateName(opts: {
  query: string;
  jurisdiction: Jurisdiction;
  registryCode: string;
  register: RegisterEntry[];
  restrictedWords: readonly RestrictedWord[];
  suggest: boolean;
  extraIssues?: NameIssue[];
  now?: Date;
}): NameAvailabilityResult {
  const query = opts.query.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeCompanyName(query);
  const base = stripLegalEnding(query);
  const issues: NameIssue[] = [];

  if (!COMPANY_NAME_CHARS.test(query)) {
    issues.push({ code: "INVALID_CHARACTERS", severity: "error", message: "The name contains characters the registry doesn't accept." });
  }
  if (base.length < 2 || normalizedName.length < 2) {
    issues.push({ code: "TOO_SHORT", severity: "error", message: "The distinctive part of the name is too short." });
  }
  if (!LEGAL_ENDING_REGEX.test(query)) {
    issues.push({ code: "MISSING_LEGAL_ENDING", severity: "warning", message: "The name needs a legal ending such as Ltd, LLC or Inc." });
  }

  const conflicts = opts.register
    .map((entry) => ({ name: entry.name, registryNumber: entry.number, similarity: nameSimilarity(entry.name, query) }))
    .filter((c) => c.similarity >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)
    .map((c) => ({ ...c, similarity: Math.round(c.similarity * 100) / 100 }));

  const identical = conflicts.find((c) => c.similarity === 1);
  if (identical) {
    issues.push({ code: "IDENTICAL_NAME", severity: "error", message: `"${identical.name}" is already registered (${identical.registryNumber}).` });
  } else if (conflicts.length) {
    issues.push({ code: "SIMILAR_NAME", severity: "warning", message: "Similar names are registered. You can proceed, but the registry may query it." });
  }

  for (const { word, reason } of opts.restrictedWords) {
    if (new RegExp(`\\b${word}\\b`, "i").test(base)) {
      issues.push({ code: "RESTRICTED_WORD", severity: "warning", message: `"${word}" is a restricted word: ${reason}` });
    }
  }
  issues.push(...(opts.extraIssues ?? []));

  const status = issues.some((i) => i.code === "INVALID_CHARACTERS" || i.code === "TOO_SHORT")
    ? "INVALID"
    : issues.some((i) => i.severity === "error")
      ? "UNAVAILABLE"
      : "AVAILABLE";

  return {
    query,
    normalizedName,
    jurisdiction: opts.jurisdiction,
    registry: opts.registryCode,
    status,
    available: status === "AVAILABLE",
    issues,
    conflicts,
    suggestions: status === "UNAVAILABLE" && opts.suggest ? suggestAlternatives(base, query, opts.jurisdiction, opts.register) : [],
    checkedAt: (opts.now ?? new Date()).toISOString(),
  };
}

function suggestAlternatives(base: string, query: string, jurisdiction: Jurisdiction, register: RegisterEntry[]): string[] {
  const profile = getJurisdiction(jurisdiction);
  const ending = LEGAL_ENDING_REGEX.exec(query)?.[1] ?? profile.entityTypes[0]!.suffixes[0]!;
  const modifiers = ["Group", "Holdings", "Global", "Labs", "Ventures", profile.shortName.split(" ")[0], "Collective", "Studio"];
  return modifiers
    .map((m) => composeCompanyName(`${base} ${m}`, ending))
    .filter((candidate) => !register.some((e) => nameSimilarity(e.name, candidate) === 1))
    .slice(0, 4);
}
