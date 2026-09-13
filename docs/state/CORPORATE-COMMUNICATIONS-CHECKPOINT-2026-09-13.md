# Kurumsal İletişim — Implementation Checkpoint

Date: 2026-09-13
Branch: `feature/core-commerce-foundation`

## Scope position

Kurumsal İletişim is a standalone Brand & Growth Operations domain. It is not a CRM submodule. The domain is designed to integrate with CRM, Customers, Appointments, Sales, Payments, Finance and managed files/assets.

The complete target scope remains documented in `docs/24-CORPORATE-COMMUNICATIONS.md`.

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
- web routes for Overview, Campaigns, Lead & Conversion, Brand Center, Ad Accounts and Routing

## Marketing Lead -> CRM bridge

The operational CRM bridge is implemented.

Flow:

```text
Marketing Lead
    ↓
Routing Rule Resolution
    ↓
Branch Resolution
    ↓
Owner Resolution
    ↓
CRM Lead
    ↓
CRM Audit Event
```

Runtime guarantees:

- serializable transaction
- marketing lead row lock with `FOR UPDATE`
- idempotent repeat conversion
- one marketing lead links to one CRM lead
- active tenant/company/branch scope is preserved
- resolved owner must be eligible in the target branch
- cross-branch routing is rejected when an active branch is selected
- CRM event records provider, campaign and routing decision metadata

## Dynamic routing

### FIXED

Routes to an explicitly configured branch and/or user.

### LEAST_LOADED

Selects the eligible branch user with the fewest open CRM leads.

Open workload is based on active CRM lead states rather than arbitrary user ordering.

### ROUND_ROBIN

Uses prior routed marketing-lead counts to select the least-used eligible assignee, with stable ordering as a deterministic tie breaker.

## Automatic first-contact SLA

Routing rule `conditions` now acts as an operational policy contract:

```json
{
  "autoFollowUp": true,
  "followUpSlaMinutes": 15,
  "followUpChannel": "CALL"
}
```

Supported first-contact channels:

- `CALL`
- `WHATSAPP`
- `SMS`
- `EMAIL`
- `IN_PERSON`
- `OTHER`

When a marketing lead is converted to CRM and an owner is resolved:

1. the CRM lead is created;
2. the marketing lead is linked to the CRM lead;
3. the import audit event is written;
4. when `autoFollowUp=true`, the initial CRM follow-up is created in the same transaction;
5. follow-up due time is calculated from the configured SLA;
6. the follow-up creation event stores marketing lead, campaign, routing rule, channel and SLA metadata.

If automatic follow-up is disabled, no task is silently created.

Existing routing rules with empty conditions use safe defaults:

- automatic first-contact task: enabled
- SLA: 15 minutes
- channel: CALL

## Web routing UX

The Lead Routing screen now supports configuration of:

- routing strategy
- provider
- campaign
- target branch
- target user
- automatic first-contact task toggle
- first-contact SLA minutes
- first-contact channel

Existing rules display their first-contact policy.

## Verified tests

Coverage includes:

- Marketing Lead -> CRM idempotency
- cross-branch routing denial
- FIXED routing
- LEAST_LOADED routing
- ROUND_ROBIN routing
- automatic CRM follow-up creation
- configured channel propagation
- configured SLA propagation
- disabling automatic follow-up

## Latest verified quality gate

Code checkpoint:

```text
e07f072c4f092243cd581e44eedba668196aecc0
test(communications): cover automatic crm follow-up sla
```

Monorepo quality:

```text
Run #1406
Run ID: 34773697777
SUCCESS
```

Verified blocking gates:

- frozen dependency installation
- Prisma validation
- full fresh-database migration deployment
- Prisma generation
- database typecheck/build
- shared contracts typecheck/build
- API typecheck
- API unit tests
- API E2E tests, including communications routing/SLA coverage
- API production build
- web lint
- web typecheck
- web production build

## Next implementation sequence

The next operational bridge should preserve existing Customer and Appointment invariants rather than bypass them.

Target flow:

```text
Marketing Lead
    ↓
CRM Lead
    ↓
Customer Link / Idempotent Customer Conversion
    ↓
Service + Staff + Slot Resolution
    ↓
Appointment
    ↓
Marketing Lead appointment linkage
    ↓
CRM / Attribution audit trail
```

Rules for the next increment:

- do not auto-accept KVKK, health-data or marketing permissions;
- customer conversion must be idempotent;
- appointment creation must preserve active branch/customer/staff/service checks;
- appointment creation must preserve staff-overlap concurrency protection;
- no appointment may be created without an explicit valid service, staff and time range;
- marketing attribution must retain campaign/provider linkage through appointment, sale and payment stages;
- repeated orchestration requests must not create duplicate customers or appointments.

After this bridge, the provider integration sequence remains Meta first, followed by Google Ads and TikTok, while the broader Content Ops / Approval / Vendor / Creator / PR / Digital Asset scope remains part of the documented domain roadmap.
