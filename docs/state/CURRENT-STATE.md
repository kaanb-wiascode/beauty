# VALOO — Current State

> Bu dosya projenin mevcut teknik ve ürün durumunun ana referansıdır.
> Yeni bir geliştirme oturumunda önce bu dosya, ardından ilgili domain/runbook belgeleri okunmalıdır.

Last updated: 2026-09-11

---

## 1. Project Identity

**Product Name:** VALOO  
**Repository:** `kaanb-wiascode/beauty`  
**Active Development Branch:** `feature/core-commerce-foundation`  
**Default Branch:** `main`  
**Product Type:** Multi-tenant SaaS CRM + ERP  
**Initial Market:** Türkiye

All active development remains on `feature/core-commerce-foundation`. `main` must remain untouched until an explicit merge/release decision is made.

---

## 2. Current Development Phase

Current phase:

> **Core ERP/finance backbone mature; HR/payroll advanced; customer feedback and quality-management layer now entering active implementation.**

Current priorities:

1. Preserve tenant/company/branch isolation.
2. Preserve financial idempotency, auditability, concurrency and accounting integrity.
3. Complete customer feedback → quality case governance without duplicating existing Customer/Appointment/Service/Staff/CustomerCareEvent models.
4. Add explicit permissions, assignment validation, SLA/escalation and management UI around Quality.
5. Build service-completion → feedback-request → notification automation as a separate event-driven layer.
6. Keep Google Review flow policy-compliant; never generate or manipulate reviews.
7. Continue controlled VALOO frontend consistency/accessibility work.
8. Finish every material milestone with a full green Monorepo quality run.

---

## 3. Latest Verified Quality State

Latest fully verified implementation head before this documentation-only checkpoint:

```text
5b3587a7e89cb5694894338c8b3bc7b9edb56d71
feat(hr): surface payroll policy in control center
```

GitHub Actions:

```text
Monorepo quality #714 — SUCCESS
run: 34629012181
```

Verified steps:

- Prisma schema validation and client generation
- database package typecheck/build
- shared commerce contract typecheck/build
- API typecheck
- API tests
- API build
- web lint
- web typecheck
- web build

The workflow retains a dedicated non-blocking commerce lint-debt reporting step; a green run does not mean historical lint debt is zero.

---

## 4. Architecture Invariants

The following rules must not be weakened:

- Tenant is the primary isolation boundary.
- Company/legal-entity and branch scope must be preserved where applicable.
- Employee and User are separate concepts.
- Authorization must be permission/scope-aware; role name alone is not sufficient.
- Financial mutations must remain auditable and idempotent.
- Provider/live-bank balances never replace accounting-ledger truth.
- Reconciliation remains explicit.
- Secrets/API credentials are never returned after storage.
- Internet-banking usernames/passwords are not collected.
- External providers use the integration layer rather than business-domain embedding.
- Historical transaction/tax/payroll snapshots remain authoritative for later reversals/adjustments.

---

## 5. Major Backend State

### Core commerce / customer operations

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

### Accounting / Finance

Implemented at advanced level:

- Chart of Accounts / Journal Entries
- automatic Sale / Payment / Refund posting
- Accounts Payable / Supplier Ledger / AP Aging
- Procurement / PO approval / Goods Receipt / Returns / Supplier Credit Notes
- replacement / re-delivery workflow
- VAT/KDV snapshots and reporting
- Cost Centers
- Profitability
- Budgeting / Forecasting
- 13-week cash flow
- Treasury / Working Capital / DSO / DPO
- CFO cockpit / financial health / benchmarks / alerts / management actions

### Banking / Financial Integrations

Implemented at advanced level:

- provider registry/adapters
- encrypted credential vault + rotation
- signed/idempotent webhook runtime and durable queue
- iyzico and PayTR financial workflows
- POS settlement/accounting/reconciliation
- Open Banking runtime and token lifecycle
- Garanti client-credentials integration foundation
- pagination/cursors/watermarks/overlap sync
- distributed scheduler lease and per-integration claims
- circuit breaker / timeout / safe retry
- integration operations and health monitoring

### Inventory / Warehouse

Implemented at advanced level:

- stock movements and consumption accounting
- procurement receipt/return integration
- stock adjustments / damage / expired
- warehouse valuation/reconciliation
- transfer lifecycle `PENDING → APPROVED → IN_TRANSIT → RECEIVED`
- cycle count lifecycle and accounting
- in-transit valuation

### HR / Payroll

Implemented at advanced level:

- HR operational records
- attendance / leave inputs
- payroll periods/items lifecycle
- payroll accounting
- salary and liability settlement
- settlement reversal
- payroll cancellation/reversal
- cost-center expense split
- payroll reporting/dashboard
- HR analytics
- auditable work-input snapshots
- configurable payroll policy engine

Payroll policy behavior:

- company-level settings
- overtime and unpaid-leave effects are explicit configuration, not legal constants hardcoded in code
- policy disabled means no financial effect
- preview/evaluation does not silently overwrite payroll amounts

### Marketplace / Supplier Network

Marketplace and supplier-network foundations are present on the active branch. Continue incrementally from the existing modules and current docs; do not recreate parallel supplier entities.

---

## 6. Payroll Policy UI — Completed

The Payroll Control Center now exposes company-level policy management.

Implemented:

- GET `/hr/payroll/policy`
- PUT `/hr/payroll/policy`
- GET `/hr/payroll/policy/preview`
- web API client supports `PUT`
- policy enable/disable
- overtime enable/disable
- standard monthly minutes
- overtime multiplier
- unpaid-leave deduction enable/disable
- monthly day divisor
- employee preview with overtime minutes, unpaid-leave days, base gross, proposed gross and delta

Important rule:

> Preview is decision support. It does not automatically mutate the employee's payroll amounts.

Current UI note: the policy panel currently previews the current calendar month independently from the payroll dashboard's internal selector. A future UI refinement can lift the period selector into a shared state without changing backend semantics.

---

## 7. Customer Feedback & Quality Management — Foundation Completed

Migration:

```text
packages/database/prisma/migrations/20260911220000_quality_management_foundation/migration.sql
```

New persistence:

- `customer_feedback`
- `quality_cases`
- `quality_case_events`

The design reuses existing Customer, Appointment, Service, Staff, Branch and `CustomerCareEvent` records rather than creating parallel operational models.

### Customer Feedback

Feedback can link to:

- Branch
- Customer
- Appointment
- Service
- Staff
- existing Customer Care Event

Supported source values:

- `MANUAL`
- `POST_SERVICE`
- `COMPLAINT`
- `CUSTOMER_PORTAL`
- `IMPORT`

Classification foundation:

- `UNCLASSIFIED`
- `POSITIVE`
- `NEUTRAL`
- `NEGATIVE`
- `CRITICAL`

No rating threshold is hardcoded to automatically classify/escalate feedback. Automatic policy belongs in a later configurable policy layer.

### Quality Case

Supported sources:

- `FEEDBACK`
- `CARE_EVENT`
- `MANUAL`
- `INCIDENT`

Lifecycle follows `docs/07-DOMAIN-FLOWS.md`:

```text
OPEN
  ↓
INVESTIGATING
  ↓
ACTION_REQUIRED
  ↓
RESOLVED
  ↓
CLOSED
```

`INVESTIGATING → RESOLVED` is also supported when no separate action-required stage is necessary.

Resolution requires:

- root cause
- corrective action
- resolution

The schema also supports:

- preventive action
- customer follow-up
- assignee
- severity
- SLA due date
- lifecycle timestamps

### Quality Audit / Integrity

- assignment and lifecycle events are written to `quality_case_events`
- actor comes from authenticated JWT context
- tenant/company/branch scope is enforced
- Customer/Appointment/Service/Staff/CustomerCareEvent references are scope-validated
- appointment/customer/service/staff relationship mismatches are rejected
- one feedback can create at most one quality case
- feedback escalation is idempotent
- state transitions are serialized and row-locked

API foundation:

```text
GET  /quality/feedback
POST /quality/feedback
POST /quality/feedback/:id/escalate
GET  /quality/cases
GET  /quality/cases/:id
POST /quality/cases
POST /quality/cases/:id/assign
POST /quality/cases/:id/transition
```

Regression coverage includes rating validation, tenant/company/branch scoping, feedback escalation idempotency and lifecycle/resolution guards.

---

## 8. Quality Management — Not Yet Complete

The following must not be described as implemented yet:

- service-completion driven feedback-request creation
- notification delivery for feedback requests
- configurable automatic classification/escalation rules
- Quality-specific permission model
- explicit assignee membership/company/branch validation
- SLA breach scheduler and escalation
- Quality Management web cockpit
- customer-facing feedback form/portal workflow
- customer follow-up automation
- analytics / recurring root-cause reporting
- Google Review invitation workflow

Google Review work must follow platform rules and customer choice. VALOO must never manufacture, gate deceptively, or manipulate reviews.

---

## 9. Shared Frontend Systems

Established shared systems:

- Data View V2 — `apps/web/components/data-view.tsx`
- Form System V2 — `apps/web/components/form-system.tsx`
- Finance View V2 — `apps/web/components/finance-view.tsx`
- typed CFO contracts
- typed Inventory contracts
- reusable Inventory form shell

Modernized operational surfaces include Customers, Staff, Services, Payments, Appointments, Finance/CFO, HR/Payroll and Inventory.

User-facing product brand is **VALOO**. Legacy `Beauty ERP` wording and `beauty*` technical identifiers remain controlled technical debt. Do not bulk-rename package/database/migration/environment identifiers without dependency analysis.

---

## 10. Known Frontend / Documentation Debt

Remaining cleanup includes:

- Services quick-panel actions that lack a verified route/backend flow
- route-specific responsive/accessibility/consistency review
- keyboard/focus and mobile table/list fallbacks
- controlled brand/documentation cleanup
- reconcile local Dashboard/AppShell work before overwriting those files

Some UI datasets are intentionally bounded. Page-local counts must never be presented as global totals unless the endpoint truly returns global aggregates.

---

## 11. Documentation Protocol

At each significant milestone:

1. inspect the current implementation before editing;
2. preserve existing domain/API semantics;
3. commit only to `feature/core-commerce-foundation`;
4. inspect the real GitHub Actions run/jobs;
5. fix blocking lint/typecheck/build/test errors;
6. update this file when project state materially changes;
7. update architecture/domain/runbook docs when contracts change.

Do not use an empty combined commit status as proof that CI passed.

---

## 12. Current Next Action

```text
Quality permission + assignee-scope hardening
        ↓
Quality SLA / escalation runtime
        ↓
ServiceCompleted → Feedback Request foundation
        ↓
Notification integration for feedback requests
        ↓
Quality Management web cockpit
        ↓
Quality analytics / recurring root-cause reporting
        ↓
Google Review invitation workflow
```

In parallel, continue remaining VALOO frontend consistency/brand cleanup without weakening domain integrity.

---

## 13. Current Status Summary

```text
Core multi-tenant architecture       ✅ established
Authorization foundation             ✅ established
CRM / Customers                      ✅ active
Appointments / Services              ✅ active
Packages / Sessions                  ✅ advanced
Sales / Payments                     ✅ advanced
Accounting / AP / Procurement        ✅ advanced
VAT / Tax                            ✅ advanced foundation
Inventory / Warehouse                ✅ advanced
Profitability / CFO / Treasury       ✅ advanced
Banking / POS integrations           ✅ advanced
HR / Payroll                         ✅ advanced
Payroll policy engine                ✅ backend + management UI
Marketplace / Supplier Network       🟡 active foundation
Customer Feedback                    ✅ persistence/API foundation
Quality Management                   ✅ governance foundation
Quality permissions                  ⏳ next
Quality SLA/escalation               ⏳ next
Feedback request automation          ⏳ next
Notifications                        ⏳ broader integration pending
Quality web cockpit                  ⏳ pending
Google Review workflow               ⏳ pending
Customer Portal                      ⏳ pending
Data Migration                       ⏳ pending
Route accessibility/consistency      ⏳ final review
Controlled brand/docs cleanup        ⏳ ongoing
```

---

## 14. Release Boundary

This remains a development-branch checkpoint, not a release declaration.

`main` remains untouched until an explicit merge/release decision is made.
