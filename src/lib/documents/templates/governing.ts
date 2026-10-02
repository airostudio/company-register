import type { DocumentType } from "@/lib/domain";
import { getEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import { formatAddress } from "@/lib/validation/address";
import { formatDate } from "@/lib/utils";
import { renderPdf } from "../pdf";
import type { DocumentContext } from "../types";

export type GoverningType = Extract<DocumentType, "CONSTITUTION" | "BYLAWS" | "OPERATING_AGREEMENT" | "ARTICLES_OF_ASSOCIATION">;

interface Part {
  title: string;
  clauses: string[];
}

/**
 * Standard-form governing documents. The clause text is a condensed template
 * for scaffolding — have it reviewed by a lawyer in each jurisdiction before
 * shipping to customers.
 */
export function partsFor(type: GoverningType, ctx: DocumentContext): Part[] {
  const name = ctx.company.name;
  switch (type) {
    case "CONSTITUTION":
      return [
        {
          title: "Preliminary",
          clauses: [
            `This is the constitution of ${name} (the Company), a proprietary company limited by shares registered under the Corporations Act 2001 (Cth) (the Act).`,
            "The replaceable rules in the Act do not apply to the Company except to the extent they are repeated in this constitution.",
            "The Company must not engage in any activity that would require disclosure to investors under Chapter 6D of the Act, other than an offer excluded from that requirement.",
          ],
        },
        {
          title: "Shares",
          clauses: [
            "Subject to the Act, the directors may issue, allot or grant options over shares in the Company on any terms and at any time they decide.",
            "Before issuing new shares, the directors must offer them to existing shareholders in proportion to their holdings, unless all shareholders agree otherwise in writing.",
            "The Company must keep a register of members and issue a share certificate within 2 months after shares are issued.",
            "A shareholder wishing to transfer shares must first offer them to the other shareholders at a fair value determined by the directors or an independent valuer.",
          ],
        },
        {
          title: "Directors",
          clauses: [
            "The Company must have at least one director, and at least one director must ordinarily reside in Australia.",
            "Directors may be appointed or removed by ordinary resolution of shareholders or, for casual vacancies, by the directors.",
            "The directors are responsible for managing the business of the Company and may exercise all powers of the Company not required by the Act to be exercised in general meeting.",
            "A director who has a material personal interest in a matter must disclose it to the other directors and must not vote on the matter unless the Act permits.",
          ],
        },
        {
          title: "Meetings and resolutions",
          clauses: [
            "A resolution in writing signed by all shareholders entitled to vote is as valid as if passed at a general meeting.",
            "If the Company has only one director, that director may pass a resolution by recording it and signing the record.",
            "The quorum for a meeting of shareholders is two shareholders, or one if the Company has only one shareholder.",
          ],
        },
        {
          title: "Dividends and winding up",
          clauses: [
            "The directors may determine that a dividend is payable, but only if (a) the Company's assets exceed its liabilities immediately before the dividend is declared and the excess is sufficient for the payment, (b) the payment is fair and reasonable to the Company's shareholders as a whole, and (c) the payment does not materially prejudice the Company's ability to pay its creditors (section 254T of the Act).",
            "On a winding up, surplus assets are distributed among shareholders in proportion to the shares held, subject to any special rights attached to a class of shares.",
          ],
        },
      ];
    case "BYLAWS":
      return [
        {
          title: "Article I — Offices",
          clauses: [
            `The registered office of ${name} (the Corporation) shall be at ${formatAddress(ctx.company.registeredOffice)}, and its registered agent shall be ${ctx.company.registeredAgentName ?? "as stated in the Certificate of Incorporation"}.`,
            "The Corporation may have other offices within or outside the State of incorporation as the Board of Directors may determine.",
          ],
        },
        {
          title: "Article II — Stockholders",
          clauses: [
            "An annual meeting of stockholders shall be held for the election of directors at a date and time designated by the Board.",
            "A majority of the shares entitled to vote, present in person or by proxy, constitutes a quorum.",
            "Any action required to be taken at a meeting of stockholders may be taken without a meeting by written consent signed by holders having not less than the minimum votes required.",
          ],
        },
        {
          title: "Article III — Board of Directors",
          clauses: [
            "The business and affairs of the Corporation shall be managed by or under the direction of the Board of Directors.",
            "The number of directors shall be fixed by resolution of the Board, and each director shall hold office until a successor is elected and qualified.",
            "Any action required or permitted to be taken by the Board may be taken without a meeting if all directors consent in writing or by electronic transmission.",
          ],
        },
        {
          title: "Article IV — Officers",
          clauses: [
            "The officers of the Corporation shall be a President, a Secretary and a Treasurer, and such other officers as the Board may appoint. One person may hold any number of offices.",
            "The President is the chief executive officer and has general supervision of the business of the Corporation.",
            "The Secretary shall keep the minutes of meetings and the stock ledger of the Corporation.",
          ],
        },
        {
          title: "Article V — Stock",
          clauses: [
            "Shares may be certificated or uncertificated. Certificates shall be signed by any two authorized officers.",
            "Transfers of stock shall be recorded in the stock ledger upon surrender of the certificate or proper transfer instructions.",
          ],
        },
        {
          title: "Article VI — Indemnification",
          clauses: [
            "The Corporation shall indemnify its directors and officers to the fullest extent permitted by applicable law.",
          ],
        },
      ];
    case "OPERATING_AGREEMENT":
      return [
        {
          title: "Article 1 — Formation",
          clauses: [
            `${name} (the Company) was formed as a limited liability company under the laws of the State of ${getJurisdiction(ctx.company.jurisdiction).shortName}.`,
            `The Company's purpose is: ${ctx.company.businessActivity ?? "any lawful business"}.`,
            "The Company shall continue until dissolved in accordance with this Agreement or applicable law.",
          ],
        },
        {
          title: "Article 2 — Members and capital",
          clauses: [
            "The Members, their Membership Interests and initial Capital Contributions are listed in Schedule A.",
            "No Member is required to make additional capital contributions. No Member shall be personally liable for the debts or obligations of the Company.",
            "Membership Interests may not be transferred without the prior written consent of Members holding a majority of Membership Interests.",
          ],
        },
        {
          title: "Article 3 — Management",
          clauses: [
            "The Company is managed by the Manager(s) listed in Schedule A, who have authority to bind the Company in the ordinary course of business.",
            "The following actions require the consent of Members holding a majority of Membership Interests: admitting new members, selling substantially all assets, amending this Agreement, and dissolving the Company.",
          ],
        },
        {
          title: "Article 4 — Allocations and distributions",
          clauses: [
            "Profits and losses are allocated to the Members in proportion to their Membership Interests.",
            "Distributions shall be made at the times and in the amounts determined by the Manager(s), pro rata to Membership Interests.",
            "For US federal income tax purposes, the Company shall be treated as a disregarded entity or partnership unless it elects otherwise.",
          ],
        },
        {
          title: "Article 5 — Dissolution",
          clauses: [
            "On dissolution, the Company's assets shall be applied first to creditors, then distributed to the Members in accordance with their positive capital account balances.",
          ],
        },
      ];
    case "ARTICLES_OF_ASSOCIATION":
      return [
        {
          title: "Part 1 — Interpretation and limitation of liability",
          clauses: [
            `These are the articles of association of ${name} (the Company), a private company limited by shares. The Model Articles for private companies limited by shares (Schedule 1, Companies (Model Articles) Regulations 2008) apply except where modified below.`,
            "The liability of the members is limited to the amount, if any, unpaid on the shares held by them.",
          ],
        },
        {
          title: "Part 2 — Directors",
          clauses: [
            "Subject to the articles, the directors are responsible for the management of the Company's business, for which purpose they may exercise all the powers of the Company.",
            "If the Company has only one director, that director may take decisions without regard to the provisions on quorum and collective decision-making.",
            "A director may be appointed by ordinary resolution or by a decision of the directors.",
          ],
        },
        {
          title: "Part 3 — Shares and distributions",
          clauses: [
            "While the Company has only one class of shares, the directors may allot shares of that class, or grant rights to subscribe for or convert into them, under section 550 of the Companies Act 2006. Any other allotment requires authority under section 551. Members' statutory pre-emption rights under section 561 apply unless disapplied by special resolution.",
            "Before transferring shares to a non-member, a member must first offer them to existing members pro rata at a price agreed or independently determined.",
            "The Company may by ordinary resolution declare dividends, and the directors may pay interim dividends, out of distributable profits only.",
          ],
        },
        {
          title: "Part 4 — Decision-making by shareholders",
          clauses: [
            "A written resolution passed by members holding the requisite majority is effective as if passed at a general meeting.",
            "Two qualifying persons present at a meeting are a quorum, unless the Company has only one member.",
          ],
        },
      ];
  }
}

const TITLES: Record<GoverningType, string> = {
  CONSTITUTION: "Constitution",
  BYLAWS: "Bylaws",
  OPERATING_AGREEMENT: "Operating Agreement",
  ARTICLES_OF_ASSOCIATION: "Articles of Association",
};

export function renderGoverningDocument(type: GoverningType, ctx: DocumentContext, opts: { watermark?: string } = {}): Promise<Uint8Array> {
  const jurisdiction = getJurisdiction(ctx.company.jurisdiction);
  const entity = getEntityProfile(ctx.company.jurisdiction, ctx.company.entityType);
  const title = TITLES[type];
  const footer = `${ctx.company.name} — ${title}`;

  return renderPdf({ title: `${ctx.company.name} — ${title}`, footer, watermark: opts.watermark }, (w) => {
    w.title(title, `${ctx.company.name} · ${entity.label} · ${jurisdiction.name}`);
    if (ctx.company.registryNumber) {
      w.paragraph(`${jurisdiction.identifiers.companyNumber}: ${ctx.company.registryNumber}`, { color: "#475569" });
    }
    w.note(
      "Standard-form document generated by GlobalCorp Hub. It is suitable for most small companies but is not legal advice — consider having it reviewed if you have investors, multiple share classes or special arrangements.",
    );

    partsFor(type, ctx).forEach((part, p) => {
      w.heading(part.title);
      part.clauses.forEach((clause, c) => w.clause(`${p + 1}.${c + 1}`, clause));
    });

    if (type === "OPERATING_AGREEMENT") {
      w.heading("Schedule A — Members and Managers");
      w.table(
        [
          { header: "Member", width: 0.45 },
          { header: "Membership interest", width: 0.25, align: "right" },
          { header: "Contribution", width: 0.3, align: "right" },
        ],
        ctx.shareholders.map((s) => [s.fullName, `${((s.units / ctx.totalUnits) * 100).toFixed(2)}%`, "As recorded in the Company's books"]),
      );
      w.paragraph(
        `Manager(s): ${ctx.officers.filter((o) => o.roles.includes("MANAGER")).map((o) => o.fullName).join(", ") || "Member-managed"}`,
      );
    }

    w.heading("Adoption");
    w.paragraph(
      `Adopted on ${formatDate(ctx.company.incorporatedAt ?? ctx.generatedAt, { dateStyle: "long" })} by the ${type === "OPERATING_AGREEMENT" ? "Members" : "initial shareholders and directors"}.`,
    );
    const signatories =
      type === "OPERATING_AGREEMENT"
        ? ctx.shareholders.map((s) => ({ name: s.fullName, capacity: "Member" }))
        : ctx.officers
            .filter((o) => o.roles.includes("DIRECTOR"))
            .map((o) => ({ name: o.fullName, capacity: "Director" }));
    w.signatureBlock(signatories);
  });
}
