# Legal review checklist

**Status: no template has been reviewed by a lawyer.** Customers' documents carry a "DRAFT · PENDING LEGAL REVIEW" watermark until a lawyer approves each template.

The templates were drafted from the statutes cited below, but drafting isn't legal advice. Each jurisdiction needs a lawyer admitted there to review its templates and the rules the platform enforces.

## How the review works in the product

1. Open **Ops → Legal templates** (`/admin/templates`, ADMIN role).
2. Send the reviewer each template's **preview PDF** and its checklist. The preview uses a fixed sample company.
3. When written advice comes back, record it against the template's **fingerprint**:
   - lawyer
   - firm
   - admission
   - advice reference
   - date
   - outcome
4. An approval covers only that exact wording. Any edit to a template changes its fingerprint and shows "Wording changed since review".
5. Every generated or signed document stores the template id, version and fingerprint, and whether that wording had been approved. If the advice changes later, you can find every affected document.
6. `TEMPLATE_REVIEW_MODE=off` removes the watermark (local development only).

When changing wording, bump the template's `version` in `src/lib/documents/templates/catalog.ts` and send it for review again.

## Templates

| Template id | Where the wording lives | Reviewer must confirm |
| --- | --- | --- |
| `AU_CONSTITUTION` | `templates/governing.ts` (`CONSTITUTION`) | Replaceable rules displaced correctly; pre-emption on issue and transfer; director-interest clause suits a proprietary company (s195 only binds public companies); dividends reflect s254T; Ch 6D restriction (s113) |
| `US_DE_BYLAWS`, `US_WY_BYLAWS` | `governing.ts` (`BYLAWS`) | Officer, quorum, written-consent and indemnification provisions under the DGCL / Wyoming BCA; consistency with the certificate of incorporation we file |
| `US_DE_OPERATING_AGREEMENT`, `US_WY_OPERATING_AGREEMENT` | `governing.ts` (`OPERATING_AGREEMENT`) | Manager-managed default; member consent matters; transfer restrictions; tax classification wording for single- and multi-member LLCs; dissolution order |
| `UK_ARTICLES` | `governing.ts` (`ARTICLES_OF_ASSOCIATION`) | Model articles incorporated with amendments; s550/s551 allotment and s561 pre-emption wording; transfer pre-emption; Companies House accepts them as bespoke articles (the XML gateway files them as `BESPOKE` with the PDF attached — confirm the attachment elements against the XSD) |
| `CONSENT_AU`, `CONSENT_UK`, `CONSENT_US_DE`, `CONSENT_US_WY` | `templates/registers.ts` (`consentStatements`) | Consent satisfies the statute (s201D; CA 2006 s12; state law); a typed-name e-signature with our audit trail is acceptable evidence |
| `SHARE_CERTIFICATE_*` | `registers.ts` (`shareCertificateWording`) | Statutory contents; valid execution by the named signatories |

## Corrections already made after self-review

- AU dividends clause now reflects all three s254T conditions, including that payment must not materially prejudice creditors.
- UK allotment clause now describes s550 (one-class private company) and s551 correctly.
- UK PSC test is "**more than** 25%". US BOI and AU use "25% or more".
- UK incorporations collect a **registered email address** and the **lawful-purpose statement**, both required by ECCTA 2023 since March 2024.
- US consents name the governing statute instead of "the laws of the State of incorporation".
- US BOI help text reflects FinCEN's March 2025 interim final rule, which exempts US-formed companies. **Verify it's still current.**

## Rules and data the platform enforces — verify

These live in `src/lib/jurisdictions/*.ts` and `src/lib/validation/formation.ts`. Several figures came from memory and **must be checked against current official fee schedules**:

| Item | Current value | File |
| --- | --- | --- |
| ASIC company registration fee | A$611 | `au.ts` |
| ASIC annual review fee | A$329 | `au.ts` |
| Delaware LLC / corporation filing fees; 24-hour expedite | US$110 / US$109; US$100 | `us.ts` |
| Delaware LLC annual tax (1 June); corp franchise tax minimum + report fee (1 March) | US$300; US$175 + US$50 | `us.ts` |
| Wyoming filing fee; annual report minimum | US$100; US$60 | `us.ts` |
| Companies House incorporation fee; confirmation statement fee | £50; £50 | `uk.ts` |
| UK first accounts due 21 months after incorporation; confirmation statement 12 months + 14 days | — | `uk.ts` |
| AU: at least one director ordinarily resident; Director ID required; directors 18+ | — | `au.ts`, `formation.ts` |
| UK: directors 16+; directors and PSCs need a Companies House personal code (identity verification) | — | `uk.ts`, `companies-house-gateway.ts` |
| Restricted / sensitive words | — | `src/lib/registry/restricted-words.ts` |
| Tax registration guidance (SS-4 for foreign responsible parties, ABN/GST thresholds, HMRC 3-month rule) | — | `src/lib/tax/application.ts` |

## Business compliance (not template wording)

The reviewer should also advise on obligations that apply to GlobalCorp Hub as a filing agent:

- **UK:** since identity verification started, third parties filing with Companies House must be registered **Authorised Corporate Service Providers (ACSPs)**. Company formation agents are **Trust or Company Service Providers** under the Money Laundering Regulations 2017 and need AML supervision (e.g. HMRC), which means customer due diligence on directors and PSCs.
- **AU:** whether lodging through ASIC requires registered-agent status or using a registered agent's software, and any AML/CTF reform obligations for company service providers (Tranche 2).
- **US:** registered agent rules and commercial registered agent registration in Delaware and Wyoming, plus state rules on who may file on a customer's behalf.
- **E-signatures:** acceptability of the signing flow under the Electronic Transactions Act 1999 (Cth), Electronic Communications Act 2000 (UK), ESIGN/UETA (US), and record-retention requirements for the audit trail.
- **Not yet in the product:** terms of service, privacy policy and data-retention policy, and the scope of what the platform does and doesn't advise on. None of these exist yet; the checkout step references "the terms of service".
