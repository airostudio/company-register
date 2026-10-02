/** Tiny XML helpers — enough to build GovTalk messages and read flat response fields without a parser dependency. */

export function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

export type XmlChild = string | false | null | undefined;

/** `el("Name", "text")` or `el("Name", [el(...), el(...)])`. Empty/undefined children are dropped. */
export function el(name: string, content: XmlChild | XmlChild[], attrs: Record<string, string> = {}): string {
  const attrText = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join("");
  if (Array.isArray(content)) {
    const inner = content.filter((c): c is string => typeof c === "string" && c.length > 0).join("");
    return inner ? `<${name}${attrText}>${inner}</${name}>` : "";
  }
  if (content === undefined || content === null || content === false || content === "") return "";
  return `<${name}${attrText}>${escapeXml(content)}</${name}>`;
}

/** Text of every element with this local name (ignores namespace prefixes). */
export function xmlTexts(xml: string, localName: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${localName}>`, "g");
  return [...xml.matchAll(re)].map((m) => decodeXml(m[1]!.trim()));
}

export function xmlText(xml: string, localName: string): string | undefined {
  return xmlTexts(xml, localName)[0];
}

/** Inner XML blocks for repeated elements (e.g. each <Reject>). */
export function xmlBlocks(xml: string, localName: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${localName}>`, "g");
  return [...xml.matchAll(re)].map((m) => m[1]!);
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}
