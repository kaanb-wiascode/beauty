# Kurumsal İletişim — Implementation Checkpoint

Date: 2026-09-13
Branch: `feature/core-commerce-foundation`

## Scope position

Kurumsal İletişim is a standalone Brand & Growth Operations domain. It is not a CRM submodule. The domain integrates with CRM, Customers, Appointments, Sales, Payments, Finance and managed files/assets.

The complete target scope remains documented in `docs/24-CORPORATE-COMMUNICATIONS.md`.

Staging/deployment remains intentionally parked. Supplier Network and Marketplace remain outside the active communications scope.

## Implemented foundation

Backend and web foundation currently includes:

- corporate communications bounded context
- campaign management foundation
- marketing lead inbox
- provider-aware lead ingestion
- provider/external lead idempotency
- attribution/touchpoint foundation
- Brand Center asset foundation
- advertising-provider connection metadata for Meta / Google Ads / TikTok
- lead routing rules
- `FIXED`, `ROUND_ROBIN`, `LEAST_LOADED` routing strategies
- dashboard KPIs for spend, leads, appointments, won leads, attributed revenue, CPL, CAC and ROAS
- tenant/company/branch scope enforcement
- communications permissions foundation
- Content Operations lifecycle
- governed Approval Center
- content event audit trail
- web routes for Overview, Campaigns, Lead & Conversion, Content Operations, Approval Center, Brand Center, Ad Accounts and Routing

## Operational marketing-to-commerce flow

The currently implemented and tested flow is:

```text
Marketing Lead
    ↓
Routing Rule Resolution
    ↓
Branch + CRM Owner
    ↓
CRM Lead
    ↓
Automatic First-Contact Follow-up / SLA
    ↓
Customer Link / Idempotent Customer Conversion
    ↓
Service + Staff + Time Selection
    ↓
Appointment
    ↓
CRM Opportunity
    ↓
Sale
    ↓
Sale Payment
    ↓
Collected Revenue Attribution
    ↓
Refund-aware Revenue Recalculation
```

## Marketing Lead -> CRM bridge

Runtime guarantees:

- serializable transaction
- marketing lead row lock with `FOR UPDATE`
- idempotent repeat conversion
- one marketing lead links to one CRM lead
- active tenant/company/branch scope is preserved
- resolved owner must be eligible in the target branch
- cross-branch routing is rejected when an active branch is selected
- CRM event records provider, campaign and routing decision metadata

### Dynamic routing

`FIXED` routes to an explicitly configured branch and/or user.

`LEAST_LOADED` selects the eligible branch user with the fewest open CRM leads.

`ROUND_ROBIN` uses prior routed marketing-lead counts to select the least-used eligible assignee, with stable ordering as a deterministic tie breaker.

## Automatic first-contact SLA

Routing rule `conditions` acts as an operational policy contract:

```json
{
  "autoFollowUp": true,
  "followUpSlaMinutes": 15,
  "followUpChannel": "CALL"
}
```

Supported channels:

- `CALL`
- `WHATSAPP`
- `SMS`
- `EMAIL`
- `IN_PERSON`
- `OTHER`

When enabled and an owner is resolved, the initial CRM follow-up and audit event are created in the same CRM import transaction. Existing empty conditions use safe defaults: enabled, 15 minutes, CALL.

## Marketing Lead -> Customer bridge

Implemented customer conversion guarantees:

- serializable transaction and row lock
- idempotent repeat conversion
- same-branch existing-customer matching by phone/email
- CRM lead and marketing lead share the resolved `customerId`
- new customer creation only when an existing match is unavailable
- no consent is silently accepted
- new customers receive the eight customer-consent records as `DECLINED`
- CRM audit event `MARKETING_CUSTOMER_LINKED`

Marketing, KVKK, health-data and explicit-consent flags are never inferred from an ad submission.

## Marketing Lead -> Appointment bridge

Endpoint:

```text
POST /corporate-communications/leads/:id/create-appointment
```

Important authorization boundary:

- `communications.manage` does not grant appointment creation;
- the endpoint requires `appointments.create`;
- the inbox additionally requires staff/service read access before offering the scheduling UI.

Runtime guarantees:

- active branch is required
- marketing lead must already resolve to a customer
- marketing lead row is locked
- repeat appointment request is idempotent after linkage
- customer, staff and service must belong to the active tenant/branch
- staff and service must be ACTIVE
- the same transaction-scoped advisory lock strategy as the appointment domain is used
- staff-overlap conflicts are rejected
- optional package-session availability/reservation rules are preserved
- marketing lead is updated with `appointment_id` and `APPOINTMENT` status
- CRM audit event `MARKETING_APPOINTMENT_CREATED` is appended when a CRM lead exists

The Lead Inbox now exposes the operational sequence:

```text
CRM'e Aktar -> Müşteriye Dönüştür -> Randevu Oluştur
```

## Sale and collected-revenue attribution

Migration:

```text
20260913203000_corporate_marketing_revenue_attribution
```

Attribution is database-authoritative rather than dependent on one application service path.

### Sale attribution

When a CRM Opportunity receives a new `sale_id`:

- the matching marketing lead is found through `crm_lead_id = opportunity.lead_id`;
- tenant/company/branch scope must match;
- the marketing lead receives the Sale id;
- marketing lead status becomes `WON`;
- a `SALE_CREATED` marketing touchpoint is appended.

This works with the existing governed Opportunity -> Sale flow and does not bypass Sales or Accounting.

### Revenue attribution

`sale_payments` is the source of collected-revenue truth.

After completed/refunded SalePayment mutations:

- attributed revenue is recomputed as the sum of `COMPLETED` SalePayments for that Sale;
- `REFUNDED` payments no longer count toward marketing revenue;
- the resulting amount updates `corporate_marketing_leads.revenue_amount`;
- `PAYMENT_COMPLETED` or `PAYMENT_REFUNDED` touchpoints are appended;
- all changes participate in the same database transaction as the payment mutation, so a rolled-back financial transaction cannot leave marketing revenue committed.

The migration also backfills existing Opportunity -> Sale links and existing completed SalePayment totals.

Example verified sequence:

```text
Sale created       -> revenue 0
Payment +250       -> revenue 250
Payment +100       -> revenue 350
Refund first 250   -> revenue 100
```

The communications dashboard and campaign metrics already aggregate `revenue_amount`, so ROAS and attributed revenue consume actual collected SalePayment truth instead of opportunity estimates.

## Content Operations + Approval Center

Content lifecycle foundation is implemented as a governed workflow rather than a free-form status field:

```text
IDEA -> BRIEF -> PRODUCTION -> REVIEW -> APPROVED -> SCHEDULED -> PUBLISHED -> ARCHIVED
```

Primary tables:

- `corporate_content_items`
- `corporate_content_approvals`
- `corporate_content_events`

Runtime rules:

- content creation/edit/review/schedule/publish requires `communications.manage`;
- approval decisions require separate `communications.approve`;
- a content manager without approve permission receives `403` when attempting to approve;
- an approval-only actor cannot schedule/publish content;
- content cannot be scheduled before approval;
- publishing is limited to approved or scheduled content;
- repeated review submission returns the same pending approval id and is idempotent;
- approval decisions and lifecycle actions append auditable content events;
- content, approval and event rows preserve tenant/company/branch scope.

The original heterogeneous content scope trigger exposed a runtime PostgreSQL defect because one trigger function referenced fields not present on every table. Corrective migration `20260913211500_fix_corporate_content_scope_triggers` replaces that function with table-specific item/approval/event scope guards. Event scope also validates that a referenced approval belongs to the same content and scope.

The web workspace now exposes:

- `Kurumsal İletişim -> İçerik Operasyonu`
- `Kurumsal İletişim -> Onay Merkezi`

## Verified E2E coverage

Coverage now includes:

- Marketing Lead -> CRM idempotency
- cross-branch CRM routing denial
- FIXED routing
- LEAST_LOADED routing
- ROUND_ROBIN routing
- automatic CRM follow-up creation
- configured channel/SLA propagation
- disabling automatic follow-up
- new Customer conversion with declined consents
- existing Customer reuse
- Customer conversion idempotency
- marketing Appointment creation and repeat idempotency
- staff-overlap denial
- appointment permission denial without `appointments.create`
- CRM Opportunity -> Sale marketing linkage at DB invariant level
- completed SalePayment revenue attribution
- multiple-payment revenue accumulation
- refund-aware revenue recalculation
- append-only sale/payment/refund marketing touchpoints
- content creation and lifecycle scope guards
- pre-approval scheduling denial
- review-submission idempotency
- `communications.manage` / `communications.approve` separation of duties
- approval-only scheduling denial
- approved content scheduling and publishing
- approved decision listing

## Latest verified quality gate

Code checkpoint:

```text
6404321361053c7936658b4f369681137ace2ef6
fix(communications): make content review submission idempotent
```

Monorepo quality:

```text
Run #1438
Run ID: 34776579445
SUCCESS
```

Verified blocking gates:

- frozen dependency installation
- release shell validation
- Prisma validation
- full fresh-database deployment of all 144 migrations
- Prisma generation
- database typecheck/build
- shared contracts typecheck/build
- API typecheck
- 107 API unit suites / 358 unit tests
- API E2E including communications routing, SLA, customer, appointment, revenue-attribution and content-governance coverage
- API production build
- web lint
- web typecheck
- web production build

The commerce lint-debt report remains historical non-blocking debt reporting; a green run does not claim that debt is zero.

## Next implementation sequence

The verified marketing-to-commerce spine and Content Operations / Approval Center are now in place. Phase 3 should be completed before moving into the external-network phase.

Priority sequence:

1. Brand Governance expansion: tone of voice, allowed/forbidden language, hashtag rules, color/font tokens, logo usage and branch variants
2. Digital Asset Library metadata and rights/licensing lifecycle
3. Agency / Marketing Vendor management
4. Influencer / Creator CRM
5. PR / Media / Sponsorship workspace
6. campaign/channel/creative analytics and anomaly detection
7. Meta provider OAuth + webhook + campaign/ad/lead sync
8. Google Ads provider adapter
9. TikTok provider adapter
10. offline conversion feedback and multi-touch attribution models

Provider credentials must use OAuth/encrypted credential infrastructure. Password collection and plaintext credential storage remain prohibited.
