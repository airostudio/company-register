# GlobalCorp Hub

A multi-jurisdiction business formation platform. It combines EasyCompanies-style speed (instant name checks, one-pass people/ownership entry, auto-generated legal packs) with BusinessRocket-style packaging (pay-as-you-go or compliance plans, registered agents, tax ID and non-resident add-ons).

Supported today: **🇦🇺 Australia (ASIC)** Pty Ltd · **🇺🇸 Delaware / Wyoming** LLC & C-Corp · **🇬🇧 UK (Companies House)** Ltd.

The flow, end to end:

```
wizard → sign in (magic link) → pay (Stripe) → officers e-sign consents → lodge with registry
       → approval → document pack + compliance calendar → tax ID (EIN / ABN / UTR)
```

> **Legal templates are unreviewed.** Generated documents are watermarked "DRAFT · PENDING LEGAL REVIEW" until a lawyer approves each template in the ops console. See [`docs/legal-review.md`](docs/legal-review.md).

## Quick start

```bash
cp .env.example .env            # defaults: mock registries, mock payments, log email, dev mailbox
docker compose up -d postgres   # or point DATABASE_URL at any Postgres 14+
npm install                     # also runs `prisma generate`
npm run db:deploy               # applies prisma/migrations
npm run dev                     # http://localhost:3000/register
```

In development, emails (sign-in links, consent requests) appear at **http://localhost:3000/dev/mailbox** (`DEV_MAILBOX=1`). Add your email to `ADMIN_EMAILS` to get the ops console at `/admin`.

Background jobs run **inline** by default: work happens right after a request, and filings move forward when someone views them. For the durable **Inngest** workflows:

```bash
JOB_RUNNER=inngest INNGEST_DEV=1 npm run dev
npm run inngest:dev             # Inngest dev server + UI on http://localhost:8288
```

## Integrations and modes

Everything runs locally without third-party accounts. Each integration switches on when its credentials are set.

| Area | Development default | Production |
| --- | --- | --- |
| **Sign-in** | Magic links shown in `/dev/mailbox` | Resend (`RESEND_API_KEY`, `EMAIL_FROM`) |
| **Payments** | Mock provider settles instantly (refused in production unless `ALLOW_MOCK_PAYMENTS=1`) | Stripe Checkout (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; webhook at `/api/webhooks/stripe`) |
| **Registries** | `REGISTRY_MODE=mock`: simulated ASIC / US SoS / Companies House | `REGISTRY_MODE=live` (or per jurisdiction, e.g. `REGISTRY_MODE_UK=live`). See below |
| **Tax IDs** | Simulator issues correctly formatted EIN / ABN / UTR | `assisted`: staff file via the ops console (follows registry mode, or set `TAX_MODE`) |
| **Rate limits** | `RATE_LIMIT_SCALE=100` in local `.env` | Real limits; run behind a proxy that sets `X-Forwarded-For` |

**Live registries.** Live mode uses the official API wherever one exists. Everything else becomes an ops-console task that staff lodge in the registry's portal (*assisted lodgement*):

| Registry | Name search | Lodgement |
| --- | --- | --- |
| ASIC | ABN Lookup web service (`ABN_LOOKUP_GUID`) + our own register | Assisted (ASIC lodgement needs registered-agent software) |
| Delaware / Wyoming | Our own register; staff confirm with the state | Assisted (no public filing APIs) |
| Companies House | Companies House search API (`COMPANIES_HOUSE_API_KEY`) | XML Gateway electronic incorporation (`CH_XML_GATEWAY_ENABLED=1`, `CH_PRESENTER_ID`, `CH_PRESENTER_AUTH`) when every director and PSC has a Companies House personal code; otherwise assisted |

> The Companies House XML Gateway messages follow the published schema but haven't been run against the real gateway. Validate them with CH test presenter credentials (`CH_GATEWAY_TEST=1`) before enabling.

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Vitest unit tests: validation, pricing, registries (mock + live parsers), wizard, documents, template catalog, tax IDs, rate limiter, signatures, compliance calendar, Prisma ↔ TS enum sync |
| `npm run test:smoke` | E2E against a running server: magic-link sign-in, then a formation per jurisdiction, through e-signing, approval, every PDF and the tax ID |
| `npx tsx scripts/stripe-e2e.ts` | Stripe payment, subscription and webhook e2e against `scripts/fake-stripe.mjs` (no Stripe keys needed) |
| `npx tsx scripts/ops-e2e.ts` | Assisted lodgement and tax registration through the ops console (server in `REGISTRY_MODE=live`) |
| `npx tsx scripts/review-e2e.ts` | Legal template review workflow |
| `npm run typecheck` / `npm run lint` / `npm run build` | The usual checks |

## Architecture

```
 /register (client)              Route handlers                         Background (Inngest or inline)
 ┌────────────────────┐  names   ┌───────────────────────┐
 │ FormationWizard     │────────►│ IGovernmentRegistry-   │  mock │ live (API / assisted → OpsTask)
 │ RHF + Zod, Zustand  │ formations│ Adapter               │
 │ pure state machine  │────────►│ createFormation → Order│──► Stripe Checkout ──► webhook
 └─────────┬──────────┘          └───────────────────────┘          │ markOrderPaid
           │ poll /api/filings/:id                                   ▼
           │                       officers e-sign (/sign/:token) ── AWAITING_SIGNATURES
           │                                                          ▼ last signature
           └──────────────────────────────────────────────────► lodge → poll → fulfil
 /dashboard  status · vault · compliance · billing portal                ▼ approval
 /admin      ops tasks · lodgement packs · legal template reviews   document pack · calendar · tax ID
```

### Filing lifecycle

`DRAFT` (awaiting payment) → `AWAITING_SIGNATURES` → `QUEUED` → `SUBMITTED` → `UNDER_REVIEW` → `APPROVED`. Side branches:

- `REQUIRES_ACTION`: a registry requisition, a declined consent, or staff needing information.
- `REJECTED`
- `FAILED`: job retries exhausted.

Transitions are compare-and-set, so webhooks, job retries and concurrent pollers are all safe. Payment is idempotent and self-repairing: a paid order stuck in `DRAFT` is finished on the next confirm or view.

### Key modules

| Path | Responsibility |
| --- | --- |
| `prisma/schema.prisma` | Users and sessions, companies and people, filings and events, orders and subscriptions, signatures, ops tasks, documents (with template provenance), template reviews, compliance events, rate-limit buckets |
| `src/lib/jurisdictions/` | One profile per jurisdiction: entity types, fees, address and people rules, PSC/BOI thresholds, compliance rules, help text. **Adding a country starts here** |
| `src/lib/validation/` | Zod schemas per wizard step, built per jurisdiction. Shared by the wizard and the API |
| `src/lib/registry/` | `IGovernmentRegistryAdapter`, canonical `FormationPayload`, shared name evaluation, mock simulators |
| `src/server/registry/` | Live adapters: Companies House search + XML Gateway, ABN Lookup, assisted lodgement |
| `src/server/auth.ts`, `session.ts` | Magic-link sign-in; sessions stored as hashed tokens |
| `src/server/payments/` | Stripe Checkout, webhooks, subscriptions, billing portal, mock provider |
| `src/server/signatures/` | Consent-to-act e-signatures with an audit trail |
| `src/server/tax/`, `src/lib/tax/` | EIN / ABN / UTR registration: prefilled applications, mock and assisted adapters |
| `src/server/ops/`, `/admin` | Ops task queue, staff actions, lodgement packs and tax worksheets |
| `src/lib/documents/` | PDFKit documents; legal template catalog with fingerprints |
| `src/server/legal/` | Template review state; watermarking of unreviewed templates |
| `src/server/rate-limit.ts` | Postgres-backed sliding-window rate limiter |

## Testing against the mock registries

| Trigger | Result |
| --- | --- |
| A registered name, e.g. `Acme Pty Ltd`, `Canva`, `Cowboy Coffee LLC`, `Acme Widgets Ltd`, or any name already lodged in that jurisdiction | `UNAVAILABLE` with suggestions; submitting returns `409 NAME_UNAVAILABLE` |
| Name contains `Bank`, `University`, `Royal`, `Trust`… | Available, with a restricted-word warning |
| AU postcode outside its state (NSW `3000`), DE/WY ZIP outside the state, Scottish postcode filed as England | `REQUIRES_ACTION` / `INVALID_POSTAL_CODE` |
| Director ID starting with `000` | `REQUIRES_ACTION` / `INVALID_OFFICER` |
| Company name contains `requisition` / `reject` | Examiner requisition / rejection during review |
| `MOCK_REGISTRY_FAILURE_RATE=0.5` | Transient `SERVICE_UNAVAILABLE` at submission, retried |

## Before going live

- **Legal review** of every template and the business-compliance items in [`docs/legal-review.md`](docs/legal-review.md), including:
  - UK ACSP registration and AML supervision as a company formation agent
  - terms of service and privacy policy, which don't exist yet
- **Validate the Companies House XML Gateway** with test credentials, and verify the fee tables.
- Replace the placeholder registered agent / office addresses in `src/lib/jurisdictions/service-providers.ts`.
- Swap the local-disk `StorageDriver` for S3/R2 and run behind a proxy that sets `X-Forwarded-For`.
