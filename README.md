# GlobalCorp Hub

A multi-jurisdiction business formation platform. It combines EasyCompanies-style speed (instant name checks, one-pass people/ownership entry, auto-generated legal packs) with BusinessRocket-style packaging (pay-as-you-go or compliance plans, registered agents, tax ID and non-resident add-ons).

Supported today: **🇦🇺 Australia (ASIC)** Pty Ltd · **🇺🇸 Delaware / Wyoming** LLC & C-Corp · **🇬🇧 UK (Companies House)** Ltd.

> Government registries are **simulated**. The mock adapters behave like the real gateways (processing delays, name conflicts, postcode rejections, requisitions), and every registry-issued PDF is watermarked `SIMULATED`.

## Quick start

```bash
cp .env.example .env            # set SESSION_SECRET for `next start`
docker compose up -d postgres   # or point DATABASE_URL at any Postgres 14+
npm install                     # also runs `prisma generate`
npm run db:deploy               # applies prisma/migrations
npm run dev                     # http://localhost:3000/register
```

Background jobs run **inline** by default: lodgement starts right after checkout, and status moves forward whenever the tracker polls. To use the durable **Inngest** workflow instead:

```bash
JOB_RUNNER=inngest INNGEST_DEV=1 npm run dev
npm run inngest:dev             # Inngest dev server + UI on http://localhost:8288
```

Set `MOCK_REGISTRY_SPEED=0.2` to make the simulated registries approve filings in a few seconds.

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Vitest unit tests: validation, pricing, registry simulators, wizard state machine, document generation, compliance calendar, and a Prisma ↔ TS enum sync check |
| `npm run test:smoke` | End-to-end API test against a running server. Forms a company in every jurisdiction, follows the filing to approval, then downloads every PDF |
| `npm run typecheck` / `npm run lint` / `npm run build` | The usual checks |
| `npm run db:migrate` | Creates a new migration after you edit `prisma/schema.prisma` |

## Architecture

```
 /register (client)                          Route handlers                        Background
 ┌───────────────────────┐   GET /api/names/check   ┌──────────────────────┐
 │ FormationWizard       │ ───────────────────────► │ IGovernmentRegistry- │
 │  7 steps, RHF + Zod   │                          │ Adapter (per registry)│
 │  Zustand (persisted)  │   POST /api/formations   ├──────────────────────┤   formation/filing.queued
 │  pure state machine   │ ───────────────────────► │ createFormation()    │ ─────────────┐
 └──────────┬────────────┘                          │  Prisma transaction  │              ▼
            │ GET /api/filings/:id (poll)           └──────────────────────┘   ┌──────────────────────┐
            └──────────────────────────────────────────────────────────────►  │ lodge → poll → fulfil│
 /dashboard (server) ── status · document vault · compliance calendar         │ (Inngest or inline)  │
                                                                              └──────────────────────┘
```

### Key modules

| Path | Responsibility |
| --- | --- |
| `prisma/schema.prisma` | `User`, `Company`, `Officer`, `Shareholder`, `BeneficialOwner`, `Filing` + `FilingEvent`, `Document`, `Order`, `Subscription`, `ComplianceEvent` |
| `src/lib/domain.ts` | Shared enums and lifecycle mapping (Draft → Submitted → Under Review → Active). Kept in sync with Prisma by a test |
| `src/lib/jurisdictions/` | One **profile** per jurisdiction: entity types, legal endings, government fees, address rules, officer requirements, beneficial-ownership (PSC/BOI) rules, compliance rules and help-tooltip copy. **Adding a country starts here** |
| `src/lib/validation/` | Zod schemas for each step, built per jurisdiction (e.g. AU resident director + Director ID, US in-state office unless a registered agent is used, UK SIC codes + PSC). The same schemas guard the wizard and validate the API |
| `src/lib/registry/` | `IGovernmentRegistryAdapter` (`checkNameAvailability`, `submitFiling`, `pollFilingStatus`, `downloadOfficialDocuments`), the canonical `FormationPayload`, and mock simulators for ASIC, US Secretary of State and Companies House |
| `src/lib/pricing/` | Add-on and plan catalog, plus `calculateQuote()`. Government fees are itemised separately and never taxed; GST/VAT applies only to service fees |
| `src/lib/wizard/` | The pure wizard state machine (`wizardReducer`, guards, reconciliation when the entity changes) and a Zustand store persisted to `localStorage` |
| `src/lib/documents/` | PDFKit document service: incorporation summary, constitution / bylaws / operating agreement / articles, member register, share certificates, consents to act |
| `src/lib/compliance/` | Compliance calendar generator (ASIC annual review, Delaware franchise tax, UK confirmation statement and accounts…) |
| `src/server/` | Prisma client, formation creation, the idempotent lodgement service, Inngest workflow, storage driver and signed-cookie session |
| `src/components/wizard/` | The step components (shadcn/ui), live name search, ownership meter, price sidebar |

### Wizard state machine

`WizardState = { currentStep, draft, phase: editing | submitting | submitted, submission }`.

- `NEXT` only succeeds when the current step's Zod schema passes. `GOTO` can't skip ahead of the first incomplete step.
- Changing the jurisdiction or entity type (`SAVE_STEP entity`) keeps compatible data and resets the rest. For example, the base name is kept but the legal ending and name check are reset; officer roles are filtered; shareholdings are rescaled to the new share total.
- Every change is auto-saved (debounced, flushed on unmount), so refreshing the page never loses progress. After submission the wizard is locked and shows the live lodgement tracker.

### Lodgement lifecycle

`QUEUED → SUBMITTED → UNDER_REVIEW → APPROVED`. The side branches are `REQUIRES_ACTION` (the registry refused the lodgement or raised a requisition), `REJECTED`, and `FAILED` (retries exhausted). Transitions are compare-and-set on the current status, so concurrent pollers and job retries are safe. On approval the service stores the generated legal pack plus the registry's own documents, then builds the compliance calendar.

## Testing against the mock registries

| Trigger | Result |
| --- | --- |
| A registered name, e.g. `Acme Pty Ltd`, `Canva`, `Cowboy Coffee LLC`, `Acme Widgets Ltd`, or any name already lodged in this server process | `UNAVAILABLE`, with suggestions. Submitting it returns `409 NAME_UNAVAILABLE` |
| Name contains `Bank`, `University`, `Royal`, `Trust`… | Available, with a restricted-word warning |
| AU postcode outside its state (e.g. NSW `3000`), DE/WY ZIP outside the state, UK Scottish postcode filed as England | Lodgement refused: `REQUIRES_ACTION` / `INVALID_POSTAL_CODE` |
| Director ID starting with `000` | `REQUIRES_ACTION` / `INVALID_OFFICER` |
| Company name contains `requisition` | Examiner requisition during review (`REQUIRES_ACTION`) |
| Company name contains `reject` | `REJECTED` after review |
| `MOCK_REGISTRY_FAILURE_RATE=0.5` | Transient `SERVICE_UNAVAILABLE` at submission, retried by Inngest |

Registry numbers are realistic: ACNs have a valid check digit, Delaware file numbers are 7 digits, Wyoming IDs look like `2026-001234567`, and Companies House numbers are 8 digits.

## Not production-ready yet

- **Auth**: `src/server/session.ts` is a signed-cookie stand-in. An anonymous checkout can't claim an email that already has an account. Replace it with Auth.js, Clerk or similar, with email verification.
- **Payments**: orders are marked paid immediately (`paymentProvider: "mock"`). Stripe Checkout plugs in at `src/server/formations/create.ts`.
- **Live registries**: implement `IGovernmentRegistryAdapter` against ASIC, Delaware ICIS / Wyoming SOS, and the Companies House XML Gateway, then register them in `src/lib/registry/index.ts` (`REGISTRY_MODE=live`).
- **Documents** are stored on local disk (`STORAGE_DIR`). Swap in the S3/R2 driver via `StorageDriver`. Have a lawyer review the governing-document clauses for each jurisdiction.
- **Still to build**: e-signature for consents, actual tax ID filings (the add-on is priced but not fulfilled), rate limiting on `/api/names/check`, and email and SMS compliance reminders.
