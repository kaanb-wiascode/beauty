# Quality → Training → Competency Checkpoint

Last verified: 2026-09-12

Branch: `feature/core-commerce-foundation`

`main` remains untouched.

This document is the authoritative continuation point for the Quality → Training → Competency backend and its operational UI.

## 1. Verified backend state

The active branch contains an advanced, operational Quality / LMS / Competency backend with the principal domain foundations complete.

Implemented and verified capabilities include:

- Quality-driven Training rules with versioned, explainable decisions and audit history
- Training RBAC, assignment lifecycle, expiry/cancellation/completion and audit
- immutable/versioned Training courses
- lessons and learner progress
- theory exams, deterministic grading and practical assessments
- versioned reusable question bank with immutable exam snapshots
- final Training result snapshots
- Training result → competency bridge
- competency definitions and immutable/versioned competency profiles
- effective-dated staff competency-profile assignment
- competency assessment history and gap calculation
- competency-gap → Training assignment rules
- recurring competency reviews with concurrency-safe due processing
- HR `employee_profiles.position` → competency-profile mappings
- Training effectiveness measurement
- auditable effectiveness follow-up lifecycle
- certificate issuance, expiry, revocation, renewal and audit
- learning programs
- Training calendar/session scheduling, enrollment and attendance lifecycle
- employee development plans
- `TRAINING_COMPLIANCE` Branch Quality Score source
- `TRAINING_EFFECTIVENESS` Branch Quality Score source
- scheduled Branch Quality Score calculation with idempotency/audit
- Training + Competency analytics
- multi-branch Quality + Training comparison
- private managed object storage for Quality evidence and LMS documents
- manager-facing Learning Operations, staff drill-down, analytics and authoring UI

## 2. Latest verified code checkpoint

```text
8b3ab0ffef14b9b3c23e0f7cd3494afc9fbc6ff6
chore(types): align workspace lockfile

Monorepo quality #900 — SUCCESS
```

The run passed:

- `pnpm install --frozen-lockfile`
- Prisma schema validation
- Prisma client generation
- database package typecheck/build
- shared contracts typecheck/build
- API typecheck
- API test suite
- API build
- web lint
- web typecheck
- web build

The quality workflow now uses a frozen lockfile. Package/lock drift can no longer be silently repaired by CI.

## 3. Relevant recent migrations

The Training / Competency / Quality chain includes the following recent persistence milestones:

```text
20260912063000_training_quality_rule_foundation
20260912073000_competency_foundation
20260912083000_training_rbac_assignment_lifecycle
20260912093000_competency_profile_versioning
20260912103000_training_lms_assessment_foundation
20260912104000_training_course_version_guards
20260912113000_competency_training_assignment_engine
20260912123000_training_competency_result_bridge
20260912133000_training_effectiveness_foundation
20260912143000_training_lesson_progress
20260912153000_training_certificate_lifecycle
20260912153500_training_certificate_issue_audit
20260912163000_training_learning_programs
20260912173000_training_calendar_development_plans
20260912180000_training_planning_lifecycle
20260912190000_competency_recurring_reviews
20260912193000_position_competency_mapping
20260912200000_quality_score_scheduler
20260912210000_training_question_bank
20260912220000_training_effectiveness_followups
20260912223000_quality_training_effectiveness_metric
20260912230000_training_managed_documents
```

## 4. Private object storage hardening

Quality Evidence and LMS documents share a private S3-compatible object-storage abstraction.

Current guarantees:

- opaque object keys are persisted instead of public/signed URLs
- credentials are runtime configuration only and are never returned by the API
- server-generated object keys include tenant/company/domain scope
- short-lived SigV4 PUT/GET URLs are generated without an AWS SDK runtime dependency
- HEAD verification establishes actual stored size/MIME metadata
- oversize managed objects are removed before registration
- browser-active/executable content types such as HTML, JavaScript and SVG are rejected
- storage configuration is validated as a coherent environment-variable group
- signed URLs are delivery artifacts and are never domain identity

The storage adapter uses Node built-in `crypto` + `fetch`, avoiding lockfile drift from unnecessary AWS SDK packages.

## 5. Strict LMS DOCUMENT invariant

Managed Training documents are now registered in `training_managed_documents` after successful storage verification.

The verified flow is:

```text
DRAFT Course Version
      ↓
server-generated managed object key
      ↓
short-lived signed PUT
      ↓
private upload
      ↓
HEAD size/MIME verification
      ↓
training_managed_documents registry
      ↓
DOCUMENT lesson content_ref
```

A database trigger on `training_lessons` rejects a `DOCUMENT` insert/update unless the referenced object is registered for the same tenant, company and exact course version.

Managed document downloads additionally join the registry, so an unverified/legacy opaque key cannot be downloaded through the managed Training document endpoint.

This is a database-level invariant rather than only a controller convention; internal service/job writes cannot bypass it.

## 6. Branch Quality Score

Real score sources currently include:

- `INSPECTION_CATEGORY`
- `CUSTOMER_FEEDBACK`
- `TRAINING_COMPLIANCE`
- `TRAINING_EFFECTIVENESS`

`CUSTOM_METRIC` remains reserved until backed by a real, auditable calculation source.

### Training Compliance

- denominator: assignments due in the score period
- numerator: assignments completed by period end
- cancellations effective before period end are excluded
- no eligible assignments → `NO_DATA`
- optional `sourceKey` filters by course code/category

### Training Effectiveness

- effectiveness runs are selected by post-window completion
- `INSUFFICIENT_BASELINE` is excluded from the evaluable denominator
- numerator is `IMPROVED`
- score is `IMPROVED / evaluable × 100`
- no evaluable runs → `NO_DATA`
- optional `sourceKey` filters by course code/category

Manager follow-up status does not rewrite historical effectiveness evidence.

## 7. Score scheduler hardening

Scheduled Branch Quality Score processing supports:

- branch-scoped schedules
- DAILY / WEEKLY / MONTHLY cadence
- previous-day/week/month period derivation
- policy pinning
- `FOR UPDATE SKIP LOCKED` claims
- 10-minute leases
- same-period existing-score idempotency
- calculation/skip/failure audit events
- schedule advancement after successful or duplicate processing

Lease fencing is now enforced on completion and failure updates. A stale worker that loses its lease cannot advance/release a schedule after another worker has reclaimed it.

Before an expensive score calculation the active worker renews and revalidates its lease. Lost-lease outcomes are explicit rather than silently mutating schedule state.

## 8. Effectiveness feedback loop

Completed Training assignments may be evaluated against pre/post Quality evidence windows and produce:

- `IMPROVED`
- `STABLE`
- `WORSE`
- `INSUFFICIENT_BASELINE`

Non-improving or data-insufficient outcomes can produce auditable manager follow-ups. They do not automatically create disciplinary/legal HR actions.

Follow-ups support controlled acknowledgement, resolution and cancellation with actor/timestamp history and required rationale where appropriate.

## 9. Competency integrity

Core invariants remain:

- Authorization Roles and Competency Profiles are separate concepts.
- Competency assessment history is append-only/time-aware.
- Profile requirements are versioned and historical requirements are not rewritten.
- recurring review completion requires fresh assessment evidence for all active profile requirements after the review opened.
- HR position source truth remains `employee_profiles.position`; no duplicate position master was invented.
- position processing does not silently replace an existing active staff competency profile.

## 10. Training planning integrity

Planning/session lifecycle preserves:

- tenant/company/branch scope
- capacity control
- scoped staff enrollment
- optional assignment semantic validation
- session `SCHEDULED → IN_PROGRESS → COMPLETED`
- explicit cancellation
- attendance / no-show / cancellation transitions
- append-only events
- serializable transactions and row locking for material transitions

Development-plan completion requires all plan items to reach an allowed terminal state.

## 11. Operational UI already backed by these APIs

Current Learning surfaces include:

- `/training` — Learning Operations
- `/training/staff` — staff development directory
- `/training/staff/[staffId]` — staff Training/Competency drill-down
- `/training/analytics` — Learning Analytics + effectiveness follow-ups
- `/training/question-bank` — manager question-bank authoring
- `/quality/comparison` — multi-branch Quality + Training comparison

These are no longer future backend foundations; they consume existing governed APIs.

## 12. Architecture invariants

Do not weaken these rules in later work:

- every domain read/write preserves tenant/company/branch isolation where applicable
- authenticated `User` and HR `Staff` remain separate concepts
- published Training content is immutable; changes create versions
- published reusable questions are versioned; exam questions are immutable snapshots
- answer keys remain manager/server-side data
- Quality/Training automation remains explainable and auditable
- financial history elsewhere in VALOO remains idempotent/auditable/concurrency-safe
- storage credentials/secrets are never persisted in domain rows or returned in responses
- internet-banking usernames/passwords are never collected
- scheduled workers cannot escape branch scope by mutating request TenantContext
- stale workers cannot commit state after losing a fenced lease
- dashboards do not manufacture opaque composite scores
- Region reporting is not fabricated before a real Region domain exists

## 13. Backend continuation after this checkpoint

For the Quality → Training → Competency backend, the major feature foundations are complete. Remaining work is backend freeze/hardening rather than another large module build:

1. final cross-domain migration/index/constraint review
2. API validation/permission regression review on newly added endpoints
3. final tenant/company/branch isolation regression sweep
4. full `docs/state/CURRENT-STATE.md` synchronization
5. final green frozen-lockfile regression checkpoint

Separate future product work, not required to call this bounded context feature-complete:

- introduce an explicit Region domain and branch-to-region relationship if region reporting becomes a product requirement
- add additional real Quality metric sources only when auditable source data exists
- platform-wide rate limiting / edge controls as part of deployment hardening

The Quality → Training → Competency backend should now be treated as **feature-complete foundation entering final backend freeze** rather than as a planned module.
