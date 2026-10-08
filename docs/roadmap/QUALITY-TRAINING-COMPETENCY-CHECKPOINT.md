# Quality → Training → Competency Checkpoint

Last verified: 2026-09-12

Branch: `feature/core-commerce-foundation`

`main` remains untouched.

This document is the authoritative continuation point for the Quality → Training → Competency backend and its operational UI.

## 1. Backend status

The bounded context is **feature-complete and backend-frozen for the current scope**.

Implemented and verified capabilities include:

- Quality-driven Training rules with versioned rationale/audit
- Training RBAC and assignment lifecycle/audit
- immutable/versioned courses and publish guards
- lessons and learner progress
- theory exams, deterministic grading and practical assessments
- reusable versioned question bank + immutable exam snapshots
- final result snapshots
- Training result → competency bridge
- competency definitions/profiles/assessments/gaps
- competency-gap → Training assignment rules
- recurring competency review schedules/reviews
- HR position → competency-profile mappings
- Training effectiveness + manager follow-ups
- certificate issue/expiry/revoke/renewal/audit
- learning programs
- Training calendar/session/enrollment/attendance lifecycle
- employee development plans
- `TRAINING_COMPLIANCE` and `TRAINING_EFFECTIVENESS` Branch Quality Score sources
- scheduled Branch Quality Score processing with lease fencing
- Training/Competency analytics and multi-branch comparison
- private managed object storage for Quality evidence and LMS documents
- operational Learning/Competency manager UI

## 2. Final verified code checkpoint

```text
59f6a2f8ac9f70c0d8c68e118dc90c554a888044
fix(supplier): align invitation id types

Monorepo quality #905 — SUCCESS
Run ID: 34669479307
```

The final freeze run passed:

- `pnpm install --frozen-lockfile`
- PostgreSQL 16 startup/health
- Prisma schema validation
- **all 121 migrations on a fresh database via `prisma migrate deploy`**
- Prisma client generation
- database package typecheck/build
- shared contracts typecheck/build
- API typecheck
- **84 test suites / 276 tests**
- API production build
- web lint
- web typecheck
- web production build

The historical commerce formatting debt step remains intentionally non-blocking. It does not weaken migration/typecheck/test/build gates.

## 3. Final migration hardening

The migration smoke gate exposed a previously hidden historical schema error in `20260911214500_supplier_invitations`: supplier organization/user references had been declared as UUID while the repository identity strategy uses TEXT.

The migration now consistently uses TEXT identifiers for invitations, supplier organizations and users and deploys successfully in the complete zero-to-current migration chain.

The latest Training persistence sequence also includes:

```text
20260912200000_quality_score_scheduler
20260912210000_training_question_bank
20260912220000_training_effectiveness_followups
20260912223000_quality_training_effectiveness_metric
20260912230000_training_managed_documents
20260912231000_training_managed_document_scope_guard
```

## 4. Managed object-storage invariants

Quality Evidence and LMS documents use private S3-compatible managed storage.

Current guarantees:

- server-generated tenant/company-scoped object keys
- short-lived dependency-free SigV4 PUT/GET URLs
- credentials remain runtime-only
- HEAD verifies actual MIME and byte size before registration/finalization
- oversized objects are rejected/removed
- HTML, JavaScript, SVG and executable MIME types are blocked
- signed URLs are temporary delivery artifacts, never persisted identity

For LMS documents, `training_managed_documents` is the verified registry.

Database-level guarantees now enforce:

1. the registered `course_version_id` belongs to the same tenant/company through a composite FK; and
2. a `DOCUMENT` lesson may only reference a verified registry object belonging to the same tenant/company/exact course version.

Internal jobs/services therefore cannot bypass the managed-document invariant merely by skipping the HTTP controller.

## 5. Branch Quality Score and scheduler

Real sources:

- `INSPECTION_CATEGORY`
- `CUSTOMER_FEEDBACK`
- `TRAINING_COMPLIANCE`
- `TRAINING_EFFECTIVENESS`

`CUSTOM_METRIC` remains reserved until backed by real auditable source data.

Score scheduling supports:

- branch-scoped schedules
- DAILY / WEEKLY / MONTHLY cadence
- policy pinning
- `FOR UPDATE SKIP LOCKED`
- expiring worker leases
- lease renewal before expensive calculation
- lease-owner fencing on completion/failure
- same-period idempotency
- append-only scheduler events
- explicit calculated/skipped/failed/lost-lease outcomes

A stale worker cannot mutate schedule state after another worker reclaims the lease.

## 6. Competency and Training integrity

Core invariants:

- Authorization Roles and Competency Profiles are separate concepts.
- Competency assessment history is append-only/time-aware.
- Profile requirements are immutable by version.
- recurring review completion requires fresh evidence for every active requirement after review opening.
- HR position source truth remains `employee_profiles.position`.
- position processing does not silently replace an active staff competency profile.
- Training planning preserves tenant/company/branch scope, capacity, enrollment semantics and audited lifecycle transitions.
- published Training content and reusable questions remain immutable/versioned.

## 7. Operational surfaces

Existing UI consuming these APIs:

- `/training`
- `/training/staff`
- `/training/staff/[staffId]`
- `/training/analytics`
- `/training/question-bank`
- `/quality/comparison`

Continue these incrementally. Do not build duplicate backend contracts or a parallel design/runtime architecture.

## 8. CI production gate

`.github/workflows/quality.yml` now runs a PostgreSQL 16 service and executes:

```text
pnpm install --frozen-lockfile
prisma validate
prisma migrate deploy
Prisma generate
DB/shared typecheck + build
API typecheck + tests + build
web lint + typecheck + build
```

Any future migration that fails from a fresh database now blocks CI before application compilation proceeds.

## 9. Continuation after backend freeze

The current backend scope should no longer be treated as needing another foundation module.

Recommended continuation order:

1. frontend/operational UX completion over existing APIs
2. deployment configuration and observability
3. end-to-end/browser workflows against a migrated environment
4. performance/load testing for critical financial, scheduling and reporting flows
5. only then explicitly approved new domains/integrations

Separate future scope that does not invalidate this freeze:

- explicit Region model + branch-to-region relationship
- additional Quality score sources backed by new auditable data
- additional bank/payment/provider integrations
- deployment-edge/global rate limiting
- historical non-blocking formatting debt cleanup

**Final status:** Quality → Training → Competency and the current cross-domain backend are backend-frozen on `feature/core-commerce-foundation`; `main` remains untouched.
