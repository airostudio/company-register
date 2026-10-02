/** Tax identifier formats: ABN (AU), EIN (US), UTR (UK). */

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

/** ABN check: subtract 1 from the first digit, weight, sum, divisible by 89. */
export function isValidAbn(abn: string): boolean {
  const digits = abn.replace(/\s/g, "");
  if (!/^\d{11}$/.test(digits) || digits[0] === "0") return false;
  const sum = digits.split("").reduce((acc, d, i) => acc + (Number(d) - (i === 0 ? 1 : 0)) * ABN_WEIGHTS[i]!, 0);
  return sum % 89 === 0;
}

export function formatAbn(abn: string): string {
  const d = abn.replace(/\s/g, "");
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
}

/** A company's ABN is its ACN with two leading check digits. */
export function abnFromAcn(acn: string): string {
  const base = acn.replace(/\s/g, "");
  if (!/^\d{9}$/.test(base)) throw new Error(`Invalid ACN: ${acn}`);
  for (let prefix = 10; prefix <= 99; prefix++) {
    const candidate = `${prefix}${base}`;
    if (isValidAbn(candidate)) return formatAbn(candidate);
  }
  throw new Error(`No valid ABN prefix for ACN ${acn}`);
}

/** IRS campus prefixes currently assigned to EINs. */
const EIN_PREFIXES = [
  10, 12, 20, 21, 22, 23, 24, 25, 26, 27, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 50, 51, 52, 53,
  54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 71, 72, 73, 74, 75, 76, 77, 80, 81, 82, 83, 84, 85, 86, 87, 88, 90, 91,
  92, 93, 94, 95, 98, 99,
];

export function isValidEin(ein: string): boolean {
  const m = /^(\d{2})-?(\d{7})$/.exec(ein.trim());
  return !!m && EIN_PREFIXES.includes(Number(m[1]));
}

export function einFromSeed(seed: number): string {
  const prefix = EIN_PREFIXES[seed % EIN_PREFIXES.length]!;
  return `${prefix}-${String(Math.floor(seed / EIN_PREFIXES.length) % 10_000_000).padStart(7, "0")}`;
}

export function isValidUtr(utr: string): boolean {
  return /^\d{10}$/.test(utr.replace(/\s/g, ""));
}

export function utrFromSeed(seed: number): string {
  return String(1_000_000_000 + (seed % 8_999_999_999)).slice(0, 10);
}
