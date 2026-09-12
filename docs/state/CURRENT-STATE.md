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

The principal backend foundations are now **feature-complete and frozen for the current scope**. New work should default to frontend/operational UX, deployment hardening, observability and explicitly approved new domains rather than recreating backend foundations.

Current priorities:

1. Preserve tenant/company/branch isolation and existing domain invariants.
2. Preserve financial idempotency, auditability, concurrency and accounting integrity.
3. Keep CI green with frozen dependency installation and fresh PostgreSQL migration smoke testing.
4. Continue frontend/operational UX on top of the governed APIs.
5. Treat new domains such as Region or new provider integrations as separate product scope.

## 3. Latest verified backend freeze checkpoint

```text
59f6a2f8ac9f70c0d8c68e118dc90c554a888044
fix(supplier): align invitation id types

Monorepo quality #905 — SUCCESS
Run ID: 34669479307
```

Verified pipeline:

- `pnpm install --frozen-lockfile`
- PostgreSQL 16 service health
- Prisma schema validation
- **all 121 migrations applied successfully to a fresh database with `prisma migrate deploy`**
- Prisma client generation
- database typecheck/build
- shared contract typecheck/build
- API typecheck
- **84 API test suites / 276 tests passed**
- API build
- web lint
- web typecheck
- web production build

The workflow now rejects package/lockfile drift and migration-chain regressions instead of allowing either to remain hidden.

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

### CRM pipeline

The first governed CRM pipeline foundation is implemented:

- branch-scoped Lead lifecycle (`NEW`, `CONTACTED`, `QUALIFIED`, `LOST`, `CONVERTED`)
- idempotent Lead -> Opportunity qualification under a serializable transaction
- governed Opportunity stage progression with optimistic version checks
- Lead/Opportunity Follow-up tasks with assignee, channel, due date and completion outcome
- append-only CRM events
- database-enforced tenant/company/branch and subject scope guards
- explicit `crm.read` / `crm.manage` permissions
- CRM cockpit, Lead pool/detail, governed Pipeline and Follow-up Center web routes
- minimal active-company assignee directory for CRM-owned assignment controls
- Lead editing, owner filtering and Follow-up assignee selection
- version-guarded Follow-up completion, rescheduling and reason-required cancellation
- append-only Follow-up lifecycle events for completion, rescheduling and cancellation

Standalone Customer -> Opportunity creation, notification delivery and Opportunity -> Sale linkage remain future increments.

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

Marketplace and supplier-network foundations are implemented on the active branch. Supplier invitations, memberships, verification and platform audit flows use the existing `supplier_organizations` model; no parallel supplier identity should be introduced.

The fresh-database migration gate exposed and fixed a historical invitation migration type mismatch: supplier organization, invitation and user references now consistently use the repository's TEXT identity strategy.

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

LMS is **implemented at advanced backend foundation level**.

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

`training_managed_documents` records successful verification. Database invariants now enforce both:

- a registry row's `course_version_id` belongs to the same tenant/company; and
- a `DOCUMENT` lesson may only link a verified object for the same tenant/company/exact course version.

HTML, JavaScript, SVG and executable content types are rejected from managed private storage.

## 8. Competency Management

Competency Management is **implemented at advanced backend foundation level**.

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

Monorepo quality now enforces both dependency and migration reproducibility:

```text
pnpm install --frozen-lockfile
PostgreSQL 16
prisma migrate deploy
```

A fresh database is created in CI and the complete migration chain must deploy successfully before package/API/web checks continue.

The dedicated commerce lint-debt step remains non-blocking historical debt reporting. A green run means the blocking migration/compile/test/build contract is satisfied; it does not claim historical commerce formatting debt is zero.

## 14. Backend freeze status

**Backend freeze for the current product scope is complete.**

The final regression established:

- fresh-database migration reproducibility
- managed-document tenant/company/course-version referential scope
- scheduler lease fencing
- controlled object-storage security
- API type safety and tests
- production API build
- frontend contract compatibility through web lint/typecheck/build

Future work that does **not** block this backend freeze:

- explicit Region domain + branch-to-region relationship
- new Quality score sources without existing auditable source data
- platform edge controls such as deployment-level/global rate limiting
- additional external provider integrations
- frontend/UX expansion over existing APIs
- cleanup of historical non-blocking commerce Prettier debt

For the Quality → Training → Competency chain and the current cross-domain backend scope, the branch should now be treated as **backend-frozen and ready for frontend/deployment-focused continuation**.
