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

> **Core ERP/finance, HR/payroll and inventory backbones are advanced. Quality Management now has an operational backend chain from feedback/inspection through Finding, Quality Case, CAPA, evidence and explainable Branch Quality Score calculations.**

Current priorities:

1. Preserve tenant/company/branch isolation.
2. Preserve financial idempotency, auditability, concurrency and accounting integrity.
3. Keep Quality as one bounded context: Signal / Feedback / Inspection → Finding → Quality Case → CAPA → Verification/Rework → Score.
4. Complete configurable Quality severity/SLA policy and standard inspection template catalog.
5. Build recurring finding/root-cause analytics and branch/region comparison views.
6. Complete operational Quality UI for inspections, evidence, CAPA and score explanations.
7. Start Education & Development/LMS + Competency Management as a separate main module integrated with HR and Quality.
8. Keep Google Review flow policy-compliant; never manufacture, deceptively gate or manipulate reviews.
9. Finish every material milestone with a full green Monorepo quality run.

---

## 3. Latest Verified Quality Baseline

Latest verified Quality backend baseline:

```text
19325c64218b014f30e37acb32311a25b557a44f
feat(quality): add inspection cancel and reschedule lifecycle
```

GitHub Actions:

```text
Monorepo quality #748 — SUCCESS
```

Immediately preceding verified Quality increments:

```text
ef361283ca0b3c4a3baf69eb25008cd86010c3ef
feat(quality): add branch quality score engine
Monorepo quality #747 — SUCCESS

cab8436295ff1b0324f683c06e15e00b22fdfd6e
feat(quality): add evidence attachment foundation
Monorepo quality #746 — SUCCESS

286d309b106492c1046c7f5293c6624f4caa5a9c
feat(quality): add CAPA rework lifecycle
Monorepo quality #745 — SUCCESS
```

Scheduler/overdue processing and its test-typing hardening are verified by Monorepo quality #744.

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
- Quality score calculations must preserve policy version and immutable calculation snapshots.
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

## 6. Customer Feedback & Quality Management

Base Quality persistence includes:

- `customer_feedback`
- `quality_cases`
- `quality_case_events`

Implemented capabilities:

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

## 7. Branch Inspection — Operational Backend Foundation

Core persistence:

- `quality_inspection_templates`
- `quality_inspection_template_items`
- `quality_inspection_schedules`
- `quality_inspections`
- `quality_inspection_results`
- `quality_findings`
- `quality_inspection_events`

Current capabilities:

- versioned checklist/template creation
- required/optional items and weights
- periodic schedule persistence
- worker-ready schedule processing with lease + `FOR UPDATE SKIP LOCKED`
- deterministic idempotent schedule occurrences
- `PLANNED → IN_PROGRESS → COMPLETED`
- `PLANNED → CANCELLED`
- audited reschedule: original is cancelled, replacement is linked and remains `PLANNED`
- result upsert per checklist item
- finding creation from inspection result
- required-item completion guard
- weighted inspection score calculation
- Finding ownership/due-date foundation
- overdue processing
- concurrency-safe Finding → Quality Case conversion
- tenant/company/branch scoping
- inspector/assignee membership-scope validation
- `quality.read` / `quality.manage` RBAC
- serializable transaction + row-lock protection for material transitions

API foundation includes:

```text
GET  /quality/inspections/templates
POST /quality/inspections/templates
POST /quality/inspections/schedules
POST /quality/inspections/schedules/process-due
GET  /quality/inspections
POST /quality/inspections
POST /quality/inspections/:id/start
POST /quality/inspections/:id/results
POST /quality/inspections/:id/complete
POST /quality/inspections/:id/cancel
POST /quality/inspections/:id/reschedule
POST /quality/inspections/findings/:findingId/case
GET  /quality/overdue
POST /quality/overdue/process
```

The design intentionally keeps Finding inside the existing Quality bounded context. Finding → Quality Case uses the established `quality_cases` lifecycle instead of creating a parallel case system.

The same inspection engine supports service quality, cleaning/hygiene, camera/control-room, employee experience, documentation/compliance and product-use verification categories.

---

## 8. CAPA — Backend Foundation Implemented

Persistence:

- `quality_capa_plans`
- `quality_capa_events`

Lifecycle:

```text
OPEN → IN_PROGRESS → VERIFICATION → EFFECTIVE → CLOSED
                         ↓
                    INEFFECTIVE
                         ↓
                    IN_PROGRESS
```

Implemented:

- create CAPA from Quality Case
- owner/due date
- status transitions
- verification result/effectiveness
- ineffective → rework → re-verification
- overdue timestamp + immutable `OVERDUE` event
- tenant/company/branch scope
- serializable transition protection

Remaining CAPA work is primarily recurring root-cause analytics, policy escalation and richer operational UI rather than basic persistence/lifecycle.

---

## 9. Quality Evidence — Foundation Implemented

Persistence:

- `quality_evidence`

Evidence can attach to exactly one of:

- Inspection
- Inspection Result
- Finding
- Quality Case
- CAPA

Stored metadata includes evidence kind, opaque object key, original filename, MIME type, byte size, SHA-256, note, capture time and uploader.

APIs:

```text
POST /quality/evidence
GET  /quality/evidence
```

Raw file bytes/public URLs are not stored as domain truth. Concrete object-storage transport remains an infrastructure integration.

---

## 10. Branch Quality Score — Backend Engine Implemented

Persistence:

- `quality_score_policies`
- `quality_score_policy_dimensions`
- `quality_score_penalty_rules`
- `branch_quality_score_runs`
- `branch_quality_score_dimension_runs`
- `branch_quality_scores` latest summary

APIs:

```text
POST /quality/scores/policies
GET  /quality/scores/policies
POST /quality/scores/calculate
GET  /quality/scores
```

Implemented metric sources:

- `INSPECTION_CATEGORY`
- `CUSTOMER_FEEDBACK`

Reserved sources:

- `TRAINING_COMPLIANCE`
- `CUSTOM_METRIC`

Reserved sources remain unsupported/no-data until backed by a real integration; the engine does not invent compliance facts.

Scoring policies preserve:

- version
- dimensions and weights
- missing-data strategy (`EXCLUDE_AND_REWEIGHT` or `ZERO_FILL`)
- severity penalty rules
- penalty cap
- immutable calculation run
- per-dimension raw/effective/weighted snapshot
- final calculation explanation

This satisfies the core requirement that Branch Quality Score be explainable and historically auditable rather than a hardcoded vanity score.

---

## 11. Quality Management — Remaining Roadmap

Not yet complete:

- configurable severity/SLA policy by category
- standard versioned inspection template catalog / branch audit packs
- recurring finding and root-cause analytics
- additional score metric sources: SLA, CAPA effectiveness, recurring findings, Training Compliance
- scheduled Branch Quality Score calculation worker
- branch/region comparison cockpit
- concrete object-storage upload/download transport
- richer operational Quality UI
- deeper customer follow-up automation
- Google Review invitation workflow
- Quality ↔ Training rule automation

Canonical execution roadmap:

```text
docs/roadmap/QUALITY-AND-LEARNING-ROADMAP.md
```

Google Review work must follow platform rules and customer choice. VALOO must never manufacture, deceptively gate or manipulate reviews.

---

## 12. Education & Development / LMS + Competency Management — Planned Main Module

This remains a separate main module, integrated with HR and Quality rather than embedded inside either domain.

Planned scope:

- training catalog/program/course/assignment
- service, sales, customer-experience, corporate and management trainings
- exams/question banks
- practical assessment
- certificates and expiry
- recurring competency reviews
- theoretical/practical scores
- competency matrix
- role/position competency requirements
- employee competency profile and gap analysis
- HR integration
- Quality Finding/Case/CAPA driven training assignment
- rule-based Quality ↔ Training automation

No employee disciplinary/legal decision should be hardcoded from a single quality signal.

---

## 13. Shared Frontend Systems

Established shared systems:

- Data View V2 — `apps/web/components/data-view.tsx`
- Form System V2 — `apps/web/components/form-system.tsx`
- Finance View V2 — `apps/web/components/finance-view.tsx`
- typed CFO contracts
- typed Inventory contracts
- reusable Inventory form shell

Modernized operational surfaces include Customers, Staff, Services, Payments, Appointments, Finance/CFO, HR/Payroll, Inventory and the Quality cockpit.

User-facing product brand is **VALOO**. Legacy `Beauty ERP` wording and `beauty*` technical identifiers remain controlled technical debt. Do not bulk-rename package/database/migration/environment identifiers without dependency analysis.

---

## 14. Documentation Protocol

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

## 15. Current Next Action

```text
Configurable Quality severity/SLA policy
        ↓
Versioned standard inspection template catalog
        ↓
Recurring finding/root-cause analytics
        ↓
Branch/region comparison + score explanation UI
        ↓
Quality operational UI completion
        ↓
LMS foundation
        ↓
Competency Management
        ↓
Quality ↔ Training rule automation
```

In parallel, continue remaining VALOO frontend consistency/brand cleanup without weakening domain integrity.

---

## 16. Current Status Summary

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
Branch Inspections                   ✅ operational backend foundation
Inspection scheduler / overdue       ✅ implemented foundation
Inspection cancel / reschedule       ✅ implemented + audited
Quality Evidence                     ✅ metadata foundation
CAPA                                 ✅ backend lifecycle + rework
Branch Quality Score                 ✅ versioned backend engine
Quality policy/catalog analytics     🟡 next backend increment
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

## 17. Release Boundary

This remains a development-branch checkpoint, not a release declaration.

`main` remains untouched until an explicit merge/release decision is made.
