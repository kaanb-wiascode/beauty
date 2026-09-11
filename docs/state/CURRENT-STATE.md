# VALOO — Current State

> Bu dosya projenin mevcut teknik ve ürün durumunun ana referansıdır.
> Yeni bir geliştirme oturumunda önce bu dosya, ardından ilgili domain/runbook belgeleri okunmalıdır.

Last updated: 2026-09-12

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

> **Core ERP/finance backbone mature; HR/payroll advanced; Quality Management now includes customer feedback, Quality Case governance, SLA/notification/public-feedback/cockpit foundations and the first Branch Inspection bounded-context increment.**

Current priorities:

1. Preserve tenant/company/branch isolation.
2. Preserve financial idempotency, auditability, concurrency and accounting integrity.
3. Continue Quality as one bounded context: Feedback / Inspection → Finding → Quality Case → future CAPA.
4. Harden Branch Inspection scheduling/execution and build operational UI without duplicating existing Quality entities.
5. Build Branch Quality Score as a versioned, explainable metric rather than a hardcoded vanity score.
6. Keep Google Review flow policy-compliant; never generate, gate deceptively or manipulate reviews.
7. Start Education & Development/LMS + Competency Management as a separate main module integrated with HR and Quality.
8. Continue controlled VALOO frontend consistency/accessibility work.
9. Finish every material milestone with a full green Monorepo quality run.

---

## 3. Latest Verified Quality Baseline

Last fully verified Quality baseline before the current Branch Inspection increment:

```text
91248d9520eb712f240facddcdc036168ab2148b
feat(quality): add management cockpit
```

GitHub Actions:

```text
Monorepo quality #739 — SUCCESS
```

Current Branch Inspection increment:

```text
c90cfec7e5693c53d9ee6892b5b4ea5414ebda0d
feat(quality): add branch inspection foundation
```

Its GitHub Actions run is tracked as Monorepo quality #740. Do not describe this increment as CI-verified until that exact run succeeds.

The workflow validates Prisma schema/client generation, database/shared packages, API typecheck/tests/build and web lint/typecheck/build. The dedicated commerce lint-debt reporting step remains non-blocking; green CI does not imply historical lint debt is zero.

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
- Quality workflow automation must remain auditable and explainable.
- Training/competency history must not be silently overwritten when requirements change.

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
- company-level payroll policy management and preview

Payroll preview remains decision support and does not silently overwrite payroll amounts.

### Marketplace / Supplier Network

Marketplace and supplier-network foundations are present on the active branch. Continue incrementally from the existing modules and current docs; do not recreate parallel supplier entities.

---

## 6. Customer Feedback & Quality Management — Implemented Foundation

Base migration:

```text
packages/database/prisma/migrations/20260911220000_quality_management_foundation/migration.sql
```

Core persistence:

- `customer_feedback`
- `quality_cases`
- `quality_case_events`

Implemented Quality capabilities on the active branch include:

- customer feedback creation/listing
- feedback → Quality Case escalation
- Quality Case lifecycle and append-only events
- explicit `quality.read` / `quality.manage` permissions
- assignee membership/company/branch validation
- SLA breach processing/escalation foundation
- service-completion feedback-request foundation
- notification outbox/dispatcher foundation
- public feedback foundation
- Quality Management web cockpit

Quality Case lifecycle:

```text
OPEN → INVESTIGATING → ACTION_REQUIRED → RESOLVED → CLOSED
```

`INVESTIGATING → RESOLVED` is also supported when no separate action-required stage is necessary.

Resolution requires root cause, corrective action and resolution. Preventive action/customer follow-up are supported.

---

## 7. Branch Inspection — Foundation Added

Migration:

```text
packages/database/prisma/migrations/20260912013000_branch_inspection_foundation/migration.sql
```

New persistence foundation:

- `quality_inspection_templates`
- `quality_inspection_template_items`
- `quality_inspection_schedules`
- `quality_inspections`
- `quality_inspection_results`
- `quality_findings`
- `branch_quality_scores`

Current capabilities:

- checklist/template creation
- required/optional items and weights
- periodic schedule persistence
- idempotent inspection planning
- `PLANNED → IN_PROGRESS → COMPLETED` execution
- result upsert per checklist item
- finding creation from inspection result
- required-item completion guard
- weighted inspection score calculation
- concurrency-safe Finding → Quality Case conversion
- tenant/company/branch scoping
- inspector/assignee membership-scope validation
- `quality.read` / `quality.manage` RBAC
- row-lock + serializable transaction protection for material transitions

API foundation:

```text
GET  /quality/inspections/templates
POST /quality/inspections/templates
POST /quality/inspections/schedules
GET  /quality/inspections
POST /quality/inspections
POST /quality/inspections/:id/start
POST /quality/inspections/:id/results
POST /quality/inspections/:id/complete
POST /quality/inspections/findings/:findingId/case
```

The design intentionally keeps Finding inside the existing Quality bounded context. Finding → Quality Case uses the established `quality_cases` lifecycle instead of creating a parallel case system.

The foundation can support service-quality, cleaning/hygiene, camera/control-room, employee-experience, documentation/compliance and product-use verification inspections.

---

## 8. Quality Management — Remaining Roadmap

Not yet complete:

- automated inspection schedule worker
- inspection cancellation/reschedule lifecycle
- evidence attachments/object-storage integration
- finding ownership and due dates
- recurring finding/root-cause detection
- explicit CAPA persistence/lifecycle/effectiveness review
- automated/versioned Branch Quality Score calculation
- branch/region comparison cockpit
- configurable automatic quality classification/escalation rules
- deeper customer follow-up automation
- Google Review invitation workflow
- Quality ↔ Training rule automation

Canonical execution roadmap:

```text
docs/roadmap/QUALITY-AND-LEARNING-ROADMAP.md
```

Google Review work must follow platform rules and customer choice. VALOO must never manufacture, gate deceptively or manipulate reviews.

---

## 9. Education & Development / LMS + Competency Management — Planned Main Module

This is a separate main module, integrated with HR and Quality rather than embedded inside either domain.

Planned scope:

- training catalog/program/course/assignment
- service, sales, satisfaction, corporate and management trainings
- exams/question banks
- practical assessment
- certificates and expiry
- recurring competency reviews
- theoretical/practical scores
- competency matrix
- role/position competency requirements
- employee competency profile and gap analysis
- HR integration
- Quality Finding/Case driven training assignment
- rule-based Quality ↔ Training automation

No employee disciplinary/legal decision should be hardcoded from a single quality signal.

---

## 10. Shared Frontend Systems

Established shared systems:

- Data View V2 — `apps/web/components/data-view.tsx`
- Form System V2 — `apps/web/components/form-system.tsx`
- Finance View V2 — `apps/web/components/finance-view.tsx`
- typed CFO contracts
- typed Inventory contracts
- reusable Inventory form shell

Modernized operational surfaces include Customers, Staff, Services, Payments, Appointments, Finance/CFO, HR/Payroll, Inventory and Quality.

User-facing product brand is **VALOO**. Legacy `Beauty ERP` wording and `beauty*` technical identifiers remain controlled technical debt. Do not bulk-rename package/database/migration/environment identifiers without dependency analysis.

---

## 11. Known Frontend / Documentation Debt

Remaining cleanup includes:

- Services quick-panel actions that lack a verified route/backend flow
- route-specific responsive/accessibility/consistency review
- keyboard/focus and mobile table/list fallbacks
- controlled brand/documentation cleanup
- reconcile local Dashboard/AppShell work before overwriting those files

Some UI datasets are intentionally bounded. Page-local counts must never be presented as global totals unless the endpoint truly returns global aggregates.

---

## 12. Documentation Protocol

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

## 13. Current Next Action

```text
Branch Inspection CI hardening
        ↓
Schedule worker + cancellation/reschedule
        ↓
Finding ownership/due dates + evidence
        ↓
CAPA lifecycle + effectiveness review
        ↓
Versioned Branch Quality Score calculation
        ↓
Inspection / CAPA operational UI
        ↓
LMS foundation
        ↓
Competency Management
        ↓
Quality ↔ Training rule automation
```

In parallel, continue remaining VALOO frontend consistency/brand cleanup without weakening domain integrity.

---

## 14. Current Status Summary

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
Customer Feedback                    ✅ implemented foundation
Quality permissions / assignee scope ✅ implemented
Quality SLA / notification           ✅ implemented foundation
Quality public feedback              ✅ implemented foundation
Quality web cockpit                  ✅ implemented
Branch Inspections                   🟡 foundation added; CI #740 pending
CAPA                                 ⏳ planned
Branch Quality Score automation      ⏳ planned
LMS / Education & Development        ⏳ planned
Competency Management                ⏳ planned
Quality ↔ Training automation        ⏳ planned
Google Review workflow               ⏳ pending
Customer Portal                      ⏳ pending
Data Migration                       ⏳ pending
Route accessibility/consistency      ⏳ final review
Controlled brand/docs cleanup        ⏳ ongoing
```

---

## 15. Release Boundary

This remains a development-branch checkpoint, not a release declaration.

`main` remains untouched until an explicit merge/release decision is made.
