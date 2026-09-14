# VALOO — Current State

> Ana teknik/ürün durum referansı. Yeni geliştirme oturumunda önce bu dosya, ardından ilgili domain checkpoint/runbook belgeleri okunmalıdır.

Last updated: 2026-09-14

## 1. Project identity

- **Product:** VALOO
- **Repository:** `kaanb-wiascode/beauty`
- **Active branch:** `feature/core-commerce-foundation`
- **Default branch:** `main`
- **Type:** Multi-tenant SaaS CRM + ERP
- **Initial market:** Türkiye

All active development remains on `feature/core-commerce-foundation`. `main` remains untouched until an explicit merge/release decision.

## 2. Current development state

The principal backend foundations are mature. Current work should extend the governed APIs and existing operational UI rather than recreate parallel domain models.

Current priorities:

1. Preserve tenant/company/branch isolation and authorization scope.
2. Preserve financial idempotency, auditability, concurrency and accounting integrity.
3. Keep the complete fresh-database migration chain and monorepo quality pipeline green.
4. Continue CRM operational maturity, automation, communication integrations and Customer 360.
5. Continue frontend/operational UX across Finance, Procurement, Inventory, HR, Quality, Training and Reporting.

## 3. Latest verified checkpoint

```text
369eb60bf72aa0042b9c462f698e74ae0b21e47b
test(crm): assert rule audit subject linkage

Monorepo quality #1601 — SUCCESS
Run ID: 34826608298
Job ID: 103920123999
```

Verified pipeline:

- frozen workspace dependency installation
- PostgreSQL 16 service health
- Prisma schema validation
- complete migration chain on a fresh database with `prisma migrate deploy`
- Prisma client generation
- database typecheck/build
- shared contract typecheck/build
- API typecheck
- API unit tests
- API E2E tests
- API production build
- web lint
- web typecheck
- web production build

## 4. Architecture invariants

The following rules must not be weakened:

- Tenant is the primary isolation boundary.
- Company/legal-entity and branch scope are mandatory where applicable.
- HR Staff/Employee and authenticated User are separate concepts.
- Authorization is permission/scope-aware; role name alone is insufficient.
- Financial mutations are auditable and idempotent.
- Historical transaction/tax/payroll snapshots remain authoritative.
- Provider/live-bank balances never replace accounting-ledger truth.
- Reconciliation remains explicit.
- Secrets/API credentials are never returned after storage.
- Internet-banking usernames/passwords are not collected.
- External providers use the integration layer rather than being embedded into business domains.
- Append-only audit/event records are not rewritten.
- Scheduled workers require concurrency controls, distributed ownership where applicable and idempotent execution.
- Signed object-storage URLs are temporary delivery artifacts, not persisted domain identity.

## 5. CRM operational state

The governed CRM chain is operational:

```text
Lead / Customer
      ↓
Opportunity
      ↓
Commercial + Stage Management
      ↓
Follow-up Lifecycle
      ↓
CRM Cockpit / Action Center / Reminders
      ↓
WON Opportunity
      ↓
Sale Draft
```

Implemented CRM capabilities include:

- branch-scoped Lead lifecycle and Lead detail/pool
- standalone Customer -> Opportunity creation
- Lead -> Opportunity qualification
- governed Opportunity stages with optimistic version checks
- Opportunity commercial editing without forcing a stage transition
- Opportunity detail with Lead/Customer identity, commercial state, follow-ups and append-only timeline
- Follow-up create/complete/reschedule/cancel lifecycle
- CRM operations cockpit and exact scoped metrics
- Action Center queues for overdue, today and stale work
- owner-scoped work queues and inline lifecycle actions
- Customer 360 CRM summary foundation
- reminder feed / operational alert foundation
- governed WON Opportunity -> Sale draft conversion
- idempotent Opportunity/Sale linkage with commercial snapshot
- server-side searchable customer picker for Opportunity creation
- explicit `crm.read` / `crm.manage` permissions

CRM mutations and reads preserve tenant/company/branch boundaries; database triggers provide a second line of scope enforcement.

## 6. CRM automation runtime

CRM automation is no longer a manual-only processor. It has a distributed background runtime.

Runtime properties:

- automatic scheduler starts shortly after application bootstrap
- approximately 5-minute processing cadence
- database-backed distributed scheduler lease
- lease heartbeat and owner-scoped release
- explicit tenant/company/branch processing scope; no synthetic request context
- PostgreSQL transaction advisory locks for source events and automation keys
- database unique partial index for automation execution keys
- append-only `AUTOMATION_EXECUTED` audit events
- safe manual-trigger/runtime races without duplicate follow-ups

Current automation rules:

1. **LEAD_FIRST_TOUCH** — new Lead -> first contact follow-up.
2. **OPPORTUNITY_STAGE_FOLLOW_UP** — open Opportunity stage change -> owner follow-up.
3. **STALE_OPPORTUNITY_FOLLOW_UP** — stale open Opportunity -> owner follow-up.

## 7. Configurable CRM automation rules

Branch-level automation rule configuration is implemented.

Database model:

- `crm_automation_rules`
- tenant/company/branch/rule uniqueness
- enabled flag
- JSON configuration
- optimistic version
- creator/updater audit users
- organization scope trigger

`crm_events` now supports `automation_rule_id` as an audited subject. Rule-update events are linked by FK to the real rule record and checked against the same tenant/company/branch.

Rule defaults preserve pre-configuration behavior when no branch override exists:

- Lead first touch: 24 hours / CALL
- Opportunity stage follow-up: 2 days, NEGOTIATION 1 day / CALL
- Stale opportunity: 14 days inactivity, follow-up after 24 hours / CALL

Supported configurable values:

- rule enabled/disabled
- first-contact delay
- normal stage delay
- negotiation stage delay
- stale inactivity threshold
- stale follow-up delay
- follow-up channel: CALL, SMS, EMAIL, WHATSAPP, IN_PERSON, OTHER

The API validates bounds per rule. Disabled event-driven rules mark source events as processed without generating a follow-up, so historical events do not accumulate and unexpectedly execute after re-enabling.

Endpoints:

- `GET /crm/automation-rules` — `crm.read`
- `PATCH /crm/automation-rules/:ruleKey` — `crm.manage`
- `POST /crm/operations/automations/process-events` — `crm.manage`
- `POST /crm/operations/automations/stale-sweep` — `crm.manage`

The stale scheduler discovery query reads each branch's configured inactivity threshold rather than assuming 14 days.

## 8. CRM Automation Center UI

Route: `/crm/automations`

The Automation Center now provides a branch-scoped rule editor:

- enable/disable each rule
- edit delay/evaluation values
- select follow-up channel
- display system-default vs branch-override state
- optimistic version-aware saves
- reload on save/version conflict
- manually process pending event automation
- manually run stale-opportunity sweep using the configured threshold

Rule changes append `AUTOMATION_RULE_UPDATED`; executions append `AUTOMATION_EXECUTED`.

## 9. Core commerce / customer operations

Implemented and substantially hardened:

- Customers
- Appointments
- Services
- Packages / Sessions
- Sales
- Payment v2
- Installments
- Customer Ledger
- refunds and payment reversals
- accounting links from operational source documents

## 10. Accounting / Finance / Banking

Implemented at advanced foundation level:

- Chart of Accounts / Journal Entries
- automatic Sale / Payment / Refund posting
- Accounts Payable / Supplier Ledger / AP Aging
- Procurement / PO approval / Goods Receipt / Returns / Supplier Credit Notes
- VAT/KDV snapshots and reporting
- Cost Centers
- Profitability
- Budgeting / Forecasting
- cash-flow and treasury foundations
- CFO cockpit / financial health / alerts
- provider registry/adapters
- encrypted credential vault + rotation
- signed/idempotent webhook runtime and durable queue
- POS settlement/accounting/reconciliation
- Open Banking runtime and token lifecycle
- provider resilience, health monitoring and distributed sync scheduler

Provider balances remain integration data; accounting-ledger truth remains authoritative.

## 11. Inventory / Warehouse

Implemented at advanced foundation level:

- stock movements and consumption accounting
- procurement receipt/return integration
- stock adjustments / damage / expiry
- warehouse valuation/reconciliation
- transfer lifecycle `PENDING → APPROVED → IN_TRANSIT → RECEIVED`
- cycle-count lifecycle and accounting
- in-transit valuation

## 12. HR / Payroll

Implemented at advanced foundation level:

- HR operational records
- attendance / leave inputs
- payroll periods/items lifecycle
- payroll accounting
- salary/liability settlement and reversal
- payroll cancellation/reversal
- cost-center expense split
- payroll reporting/dashboard
- HR analytics
- auditable work-input snapshots
- configurable payroll policy engine

Payroll preview remains decision support and never silently rewrites payroll truth.

## 13. Quality / Training / Competency

The cross-domain operational loop is implemented:

```text
Quality Signal / Finding
        ↓
Quality Case / CAPA
        ↓
Versioned Training Rule
        ↓
Training Assignment / Result
        ↓
Competency Evidence / Gap / Review
        ↓
Training Effectiveness
        ↓
Branch Quality Score
```

Foundations include:

- Quality cases, inspections, findings, CAPA/rework and evidence
- customer feedback and escalation
- explainable policy-versioned branch Quality Score
- scheduled score processing with concurrency controls
- immutable/versioned Training content and question bank
- exams, practical assessments and final result snapshots
- certificate lifecycle
- learning programs, sessions, enrollment and attendance
- development plans and effectiveness follow-ups
- competency definitions/profiles/assessments/gap calculation/reviews
- Quality ↔ Training ↔ Competency automation with idempotency/audit metadata

No disciplinary/legal HR action is automatically inferred from a single Quality or Training signal.

## 14. Object storage / security

Managed private storage is S3-compatible and controlled:

- server-generated scoped object keys
- short-lived signed PUT/GET URLs
- actual MIME/size verification
- tenant/company/course-version referential guards where applicable
- dangerous browser-active/executable MIME types rejected
- no credentials persisted in domain records

## 15. Operational UI

Important existing application surfaces include:

- `/crm` — CRM cockpit
- `/crm/actions` — CRM Action Center
- `/crm/automations` — Automation Rules + runtime controls
- `/crm/leads` and `/crm/leads/[id]`
- `/crm/pipeline`
- `/crm/opportunities/new`
- `/crm/opportunities/[id]`
- `/crm/opportunities/[id]/edit`
- `/crm/follow-ups`
- `/customers/[id]` — Customer profile / CRM handoff
- `/training`
- `/training/staff`
- `/training/staff/[staffId]`
- `/training/analytics`
- `/training/question-bank`
- `/quality/comparison`

These should be extended incrementally; do not build parallel frontend systems or duplicate backend contracts.

## 16. CI / repository hygiene

Monorepo quality enforces dependency and migration reproducibility:

```text
pnpm install --frozen-lockfile
PostgreSQL 16
prisma migrate deploy
```

A fresh database must accept the complete migration chain before package/API/web checks continue.

The dedicated commerce lint-debt step remains non-blocking historical debt reporting. A green run means the blocking migration/compile/test/build contract is satisfied; it does not claim historical commerce formatting debt is zero.

## 17. Next CRM priorities

Recommended continuation order:

1. Automation execution/history observability and rule audit UI.
2. Additional governed triggers/actions: expected-close alerts, WON/LOST workflows, follow-up outcome triggers and inactivity sequences.
3. Pipeline advanced filters, risk badges, sorting/saved views and governed drag/drop.
4. Communication adapters: WhatsApp, SMS, email, Meta/web leads and call logs.
5. Broader Customer 360 with appointments, sales, packages/sessions, payments/receivables, CRM timeline and communication history.
6. Conversion/forecast/lost-reason/sales-cycle analytics.
7. Lead duplicate detection, merge, scoring, attribution and campaign maturity.

Any new automation must preserve explicit scope, idempotency, auditability and concurrency guarantees established by the current runtime.
