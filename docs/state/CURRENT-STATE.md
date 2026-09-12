# VALOO — Current State

> Ana teknik/ürün durum referansı. Yeni geliştirme oturumunda önce bu dosya, ardından ilgili domain checkpoint/runbook belgeleri okunmalıdır.

Last updated: 2026-09-12

## 1. Project identity

- **Product:** VALOO
- **Repository:** `kaanb-wiascode/beauty`
- **Active branch:** `feature/core-commerce-foundation`
- **Default branch:** `main`
- **Type:** Multi-tenant SaaS CRM + ERP
- **Initial market:** Türkiye

All active development remains on `feature/core-commerce-foundation`. `main` remains untouched until an explicit merge/release decision.

## 2. Current phase

The backend is in **advanced feature-complete / final hardening** phase across the principal ERP domains. Current work should prioritize regression, isolation, constraints, migration/index review and production-readiness rather than recreating foundations.

Current priorities:

1. Preserve tenant/company/branch isolation.
2. Preserve financial idempotency, auditability, concurrency and accounting integrity.
3. Finish final migration/index/constraint and permission regression sweeps.
4. Keep CI green with `pnpm install --frozen-lockfile`.
5. Continue frontend/operational UX on top of the existing governed APIs.
6. Introduce new domains such as Region only when explicitly designed; do not infer/fabricate them from existing data.

## 3. Latest verified backend checkpoint

```text
8b3ab0ffef14b9b3c23e0f7cd3494afc9fbc6ff6
chore(types): align workspace lockfile

Monorepo quality #900 — SUCCESS
```

Verified pipeline:

- frozen workspace dependency install
- Prisma validation/client generation
- database typecheck/build
- shared contract typecheck/build
- API typecheck
- API tests
- API build
- web lint/typecheck/build

The workflow now rejects package/lockfile drift instead of silently repairing it.

## 4. Architecture invariants

The following rules must not be weakened:

- Tenant is the primary isolation boundary.
- Company/legal-entity and branch scope are mandatory where applicable.
- HR Staff/Employee and authenticated User are separate concepts.
- Authorization is permission/scope-aware; role name alone is insufficient.
- Financial mutations are auditable and idempotent.
- Provider/live-bank balances never replace accounting-ledger truth.
- Reconciliation remains explicit.
- Secrets/API credentials are never returned after storage.
- Internet-banking usernames/passwords are not collected.
- External providers use the integration layer rather than being embedded into business domains.
- Historical transaction/tax/payroll snapshots remain authoritative for reversals/adjustments.
- Quality/Training/Competency automation remains explainable and auditable.
- Published Training content and published reusable questions are immutable/versioned.
- Scheduled workers use concurrency controls and may not commit state after losing a fenced lease.
- Signed object-storage URLs are temporary delivery artifacts, not persisted domain identity.

## 5. Major backend state

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

### Banking / Financial integrations

Implemented at advanced level:

- provider registry/adapters
- encrypted credential vault + rotation
- signed/idempotent webhook runtime and durable queue
- iyzico and PayTR workflows
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
- stock adjustments / damage / expiry
- warehouse valuation/reconciliation
- transfer lifecycle `PENDING → APPROVED → IN_TRANSIT → RECEIVED`
- cycle-count lifecycle and accounting
- in-transit valuation

### HR / Payroll

Implemented at advanced level:

- HR operational records
- attendance / leave inputs
- payroll periods/items lifecycle
- payroll accounting
- salary/liability settlement
- settlement reversal
- payroll cancellation/reversal
- cost-center expense split
- payroll reporting/dashboard
- HR analytics
- auditable work-input snapshots
- configurable payroll policy engine
- company-level payroll policy management/preview

Payroll preview remains decision support and never silently rewrites payroll truth.

### Marketplace / Supplier Network

Marketplace and supplier-network foundations exist on the active branch. Continue from current models/docs; do not create parallel supplier entities.

## 6. Quality Management

Quality is an operational bounded context rather than a planned foundation.

Implemented chain includes:

```text
Signal / Customer Feedback / Inspection
        ↓
Finding
        ↓
Quality Case
        ↓
CAPA / Rework / Verification
        ↓
Evidence
        ↓
Explainable Branch Quality Score
```

Capabilities include:

- customer feedback and escalation
- Quality Case lifecycle/events
- inspection lifecycle including cancel/reschedule
- findings and severity/SLA processing
- CAPA and rework lifecycle
- evidence attachment foundation
- private managed evidence storage
- notification/outbox foundations
- public-feedback foundation
- Quality cockpit
- policy-versioned Branch Quality Score
- scheduled Branch Quality Score processing
- multi-branch Quality + Training comparison

Real Branch Quality Score sources now include:

- `INSPECTION_CATEGORY`
- `CUSTOMER_FEEDBACK`
- `TRAINING_COMPLIANCE`
- `TRAINING_EFFECTIVENESS`

`CUSTOM_METRIC` remains reserved until backed by a real auditable source.

## 7. Education & Development / LMS

LMS is **implemented at advanced backend foundation level**, not planned.

Implemented capabilities include:

- Training RBAC
- assignment lifecycle/audit
- immutable course versions
- publish/retire guards
- lessons and learner progress
- theory exams
- deterministic grading
- practical assessments
- final result snapshots
- reusable versioned question bank
- immutable exam-question snapshots
- certificate lifecycle/expiry/revocation/renewal
- learning programs
- Training calendar/sessions/enrollment/attendance
- development plans
- Training effectiveness
- effectiveness manager follow-ups
- Training analytics
- private controlled LMS documents

### Managed Training documents

Private documents use server-generated scoped object keys and short-lived SigV4 URLs. Actual stored MIME/size are verified with HEAD requests.

`training_managed_documents` records successful verification. A database trigger prevents a `DOCUMENT` lesson from linking a `content_ref` that is not verified for the same tenant/company/course version.

HTML, JavaScript, SVG and executable content types are rejected from managed private storage.

## 8. Competency Management

Competency Management is **implemented at advanced backend foundation level**, not planned.

Implemented capabilities include:

- competency definitions
- immutable/versioned competency profiles
- effective-dated staff profile assignment
- append-only/time-aware assessment history
- competency-gap calculation
- competency-gap → Training rules
- Training-result → competency assessment bridge
- recurring competency review schedules/reviews
- review completion guards requiring fresh evidence
- HR `employee_profiles.position` → competency-profile mapping

Authorization Roles and Competency Profiles remain separate concepts.

Position mapping does not silently replace an employee's existing active competency-profile history.

## 9. Quality ↔ Training ↔ Competency automation

The backend integration loop is operational:

```text
Quality Finding / Signal
        ↓
Versioned Training Rule
        ↓
Training Assignment
        ↓
Course / Assessment / Result
        ↓
Competency Evidence
        ↓
Competency Gap / Review
        ↓
Training Effectiveness
        ↓
Training Compliance + Effectiveness metrics
        ↓
Branch Quality Score
```

Generated assignments retain source rule/rationale and idempotency keys where applicable.

No disciplinary/legal HR action is automatically inferred from a single Quality or Training signal.

## 10. Scheduler / concurrency hardening

Quality score scheduler supports:

- due claiming with `FOR UPDATE SKIP LOCKED`
- branch scope
- worker owner + expiry lease
- lease renewal before expensive calculation
- lease-owner fencing on completion/failure
- same-period idempotency
- explicit calculated/skipped/failed/lost-lease outcomes
- append-only schedule events

A stale worker cannot advance or release a schedule after another worker has reclaimed it.

Other Training processors use serializable transactions, row locks/advisory locks or `SKIP LOCKED` where their transition model requires it.

## 11. Operational UI already consuming backend

Existing application surfaces include:

- `/training` — Learning Operations
- `/training/staff` — staff development directory
- `/training/staff/[staffId]` — staff competency/training drill-down
- `/training/analytics` — Learning Analytics + effectiveness follow-ups
- `/training/question-bank` — question-bank authoring
- `/quality/comparison` — multi-branch Quality + Training comparison

These should be extended incrementally; do not build parallel frontend systems or duplicate backend contracts.

## 12. Object storage / security state

Managed private storage is S3-compatible and dependency-light:

- Node built-in `crypto` performs SigV4 signing
- Node `fetch` performs signed HEAD/DELETE operations
- no AWS SDK runtime dependency is required
- bucket/access-key/secret configuration is validated as a coherent group
- credentials are never stored in domain records
- object keys are scoped and server-generated
- signed PUT/GET URLs are short-lived
- real storage metadata is verified before registration
- oversized managed objects are rejected/removed
- browser-active/executable MIME types are blocked

## 13. CI / repository hygiene

Monorepo quality now uses:

```text
pnpm install --frozen-lockfile
```

This is intentional. Do not restore `--no-frozen-lockfile` to hide manifest drift.

The dedicated commerce lint-debt step remains non-blocking historical debt reporting. A green run means the blocking compile/test/build contract is satisfied; it does not claim historical lint debt is zero.

## 14. Backend freeze status

The principal backend foundations are now in final freeze/hardening rather than major feature construction.

Remaining freeze work:

1. cross-domain migration/index/constraint review
2. permission and tenant/company/branch isolation regression sweep on recent endpoints
3. final docs/checkpoint consistency review
4. final full green frozen-lockfile regression

Future product scope that should not block backend feature-complete status:

- explicit Region domain + branch-to-region relationship
- new Quality score sources without existing auditable source data
- platform edge controls such as deployment-level/global rate limiting
- additional external provider integrations

For the Quality → Training → Competency chain specifically, the backend should now be treated as **feature-complete and entering final freeze**.
