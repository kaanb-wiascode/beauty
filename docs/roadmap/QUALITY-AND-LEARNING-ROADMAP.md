# VALOO — Quality Management & Learning Roadmap

Last updated: 2026-09-12

This document is the execution roadmap for Quality Management, Branch Inspections and the Learning/Competency bounded context. It supplements `docs/state/CURRENT-STATE.md` and `docs/roadmap/VALOO-IMPLEMENTATION-STATUS.md` and must remain aligned with the active development branch.

## 1. Verified baseline

Active branch: `feature/core-commerce-foundation`

Latest verified Quality + Training backend baseline:

- `d7dc33080cd540bc04b574638c99590511cad2c4`
- `test(training): fix LMS advisory lock assertion`
- Monorepo quality #761 — SUCCESS

Immediately preceding verified Training increments:

- `6cae1eeac26d8fa53eb01abf9293950ceb96f65c` — LMS transaction typing fix
- `e215c7631d158bdff195b5e37555bb8554612340` — LMS assessment engine foundation
- `d2d5778bc678a100e581cf69ec032d9b97490bad` — immutable competency profile versions — CI #758 SUCCESS
- `0b4b202992b4d8275b249835f0d287b479a3a860` — Training RBAC and assignment lifecycle — CI #757 SUCCESS
- `ea981c06` — Quality-driven Training rule foundation — CI #753 SUCCESS

Verified Quality foundation includes:

- customer feedback persistence/API
- Quality Case lifecycle and audit events
- quality permissions and assignee-scope validation
- configurable SLA policy and breach processing
- feedback-request foundation
- notification outbox/dispatcher foundation
- customer-facing public feedback foundation
- Quality Management cockpit
- Branch Inspection templates/checklists/schedules/execution
- standard inspection catalog foundation
- Findings and Finding → Quality Case conversion
- CAPA lifecycle, verification/effectiveness and rework
- scheduler/overdue processing
- controlled evidence metadata
- versioned Branch Quality Score policies and calculation runs
- planned-inspection cancellation/reschedule audit lifecycle
- recurring finding/root-cause analytics

## 2. Branch Inspection operational foundation

Current scope:

- versioned inspection templates
- checklist items with required/optional behavior and weighting
- periodic branch schedules
- worker-ready due-schedule processor with lease + `FOR UPDATE SKIP LOCKED`
- deterministic idempotent schedule occurrences
- `PLANNED → IN_PROGRESS → COMPLETED` execution lifecycle
- explicit `PLANNED → CANCELLED`
- audited reschedule that cancels the original and creates a linked replacement
- per-item results
- findings linked to inspection/results
- finding ownership/due-date foundation
- concurrency-safe Finding → Quality Case conversion
- controlled evidence metadata linked to inspection/result/finding/case/CAPA
- tenant/company/branch isolation
- `quality.read` / `quality.manage` RBAC
- assignee/inspector membership-scope validation
- serializable transactions and row locking for material transitions

The foundation is intentionally generic enough for:

- periodic service-quality inspections
- cleaning/hygiene inspections
- camera/control-room reviews
- employee-experience checks
- document/compliance checks
- product usage/verification audits

## 3. Quality Management target architecture

Quality Management remains one governance chain:

```text
Signal / Inspection / Feedback
        ↓
Finding
        ↓
Quality Case
        ↓
Root Cause
        ↓
CAPA
        ↓
Verification / Rework / Closure
        ↓
Branch Quality Score
```

Do not create parallel complaint, finding or corrective-action systems for hygiene, camera, documentation, product verification or other inspection categories.

## 4. CAPA

Implemented backend foundation:

```text
OPEN → IN_PROGRESS → VERIFICATION → EFFECTIVE → CLOSED
                         ↓
                    INEFFECTIVE
                         ↓
                    IN_PROGRESS
```

An ineffective CAPA can return to rework and then be re-verified. Rework clears the prior verification result and preserves the transition in `quality_capa_events`.

Current analytics can surface recurring finding/category/root-cause signals. Remaining CAPA extensions:

- policy-based CAPA escalation beyond the existing SLA policy layer
- branch/region trend views
- operational UI for action ownership, verification and evidence

## 5. Branch Quality Score

The score is backed by a versioned and explainable policy engine rather than a hardcoded vanity metric.

Implemented persistence:

- `quality_score_policies`
- `quality_score_policy_dimensions`
- `quality_score_penalty_rules`
- `branch_quality_score_runs`
- `branch_quality_score_dimension_runs`
- `branch_quality_scores` as latest-period summary

Implemented source kinds:

- `INSPECTION_CATEGORY`
- `CUSTOMER_FEEDBACK`

Reserved source kinds for later integrations:

- `TRAINING_COMPLIANCE`
- `CUSTOM_METRIC`

Reserved sources do not invent values; they remain unsupported/no-data until an integration provides a real metric.

Policies preserve:

- policy name/version
- calculation period
- dimensions and configured weights
- explicit missing-data strategy
- severity penalty rules
- penalty cap
- immutable calculation run
- per-dimension raw score/source count/effective weight/weighted contribution
- final score explanation

Next score extensions:

- CAPA effectiveness metric source
- SLA compliance metric source
- recurring-finding metric source
- LMS/training-compliance source
- branch/region comparison cockpit
- scheduled calculation worker

## 6. Evidence

Evidence metadata supports:

- Inspection
- Inspection Result
- Finding
- Quality Case
- CAPA

The database stores an opaque object key and metadata such as MIME type, filename, byte size, SHA-256, note, capture time and uploader. Raw files/public URLs are not embedded as domain truth. A concrete object-storage provider remains an infrastructure integration.

## 7. Education & Development / LMS bounded context

Education & Development is implemented as a separate main module integrated with HR and Quality rather than embedded inside either domain.

### Implemented backend foundation

- Training course catalog with service, sales, customer-experience, corporate, management, quality and other categories
- dedicated `training.read` / `training.manage` RBAC
- manual and Quality-rule-driven Training assignments
- assignment lifecycle, expiry processing and assignment event audit trail
- immutable/versioned course releases with `DRAFT → PUBLISHED → RETIRED`
- assignment pinning to the active published course version
- versioned lessons/content with TEXT, VIDEO, LINK and DOCUMENT content types
- opaque document references instead of persisting public/signed URLs
- theory exams with ordered questions, points, pass scores and maximum attempts
- deterministic server-side grading for single-choice, multiple-choice and true/false questions
- answer keys excluded from learner-facing published-course reads
- practical assessments with assessor, criteria, evidence, score and pass/fail result
- separate theory and practical evaluation requirements
- final Training result snapshots with explicit explanation
- database guard preventing versioned assignments from bypassing required assessment before completion
- immutable published/retired lesson, exam and question content
- certificate issuance for successful staff assignments
- certificate listing and audit events

Current assessment chain:

```text
Course
  ↓
Immutable Course Version
  ↓
Lessons / Content
  ↓
Theory Exam(s)
  ↓
Practical Assessment (when required)
  ↓
Final Result
  ↓
Assignment Completion
  ↓
Certificate
```

### Remaining LMS capabilities

- learning programs / multi-course curricula
- reusable question-bank authoring beyond course-version questions
- lesson completion/progress tracking
- Training calendar and scheduled classroom sessions
- employee development plans
- certificate renewal/revocation workflows and expiry automation
- learner/manager LMS UI
- Training analytics and compliance dashboards

## 8. Competency Management

Implemented backend foundation:

```text
Competency Definition
  ↕
Immutable Competency Profile Version
  ↕
Employee Profile Assignment
  ↕
Assessment / Exam / Practical / Training / Quality Evidence
  ↕
Gap
```

Implemented behaviors:

- company-scoped competency definitions
- competency profiles with required levels and weights
- immutable/versioned profile revisions
- effective-dated staff profile assignments
- time-aware staff competency assessments
- assessment source types: MANUAL, EXAM, PRACTICAL, TRAINING, QUALITY
- current competency-gap calculation from the active profile and latest assessment
- historical profile requirements preserved rather than overwritten

Remaining competency capabilities:

- explicit HR position/role → competency-profile mapping
- competency-gap → Training assignment rule engine
- Training completion → competency assessment mapping
- recurring review schedules
- employee/role/branch competency analytics and UI

Competency records must remain time-aware and auditable. Historical competency results and requirements must not be silently overwritten when requirements or assessment methods change.

## 9. Quality ↔ Training rule automation

### Implemented foundation

The first automation layer is rule-based and explainable, not AI-driven.

Implemented Quality Finding → Training rules support:

- versioned rules
- finding category filter
- minimum severity
- occurrence threshold
- lookback period
- assignment cooldown
- BRANCH or STAFF target scope
- tenant/company/branch isolation
- idempotent assignment source keys
- rationale containing rule/version/occurrence/evidence references
- `NO_ELIGIBLE_STAFF`, cooldown and assignment-created audit events
- no invented employee identity when a Quality signal is not linked to staff

Examples still to extend into configurable rules:

- repeated hygiene finding → mandatory hygiene refresher
- repeated service-protocol failure → practical service reassessment
- complaint-category threshold → customer-communication training
- expired certificate → employee eligibility warning
- CAPA requiring behavioral change → assigned learning path + effectiveness recheck

Rules must remain configurable, versioned and explainable. No hardcoded employee penalty or disciplinary decision should be derived automatically from a single quality signal.

## 10. Revised execution order

### Q1 — Branch Inspection foundation — COMPLETE BACKEND FOUNDATION
- template/checklist persistence
- schedule persistence
- plan/start/result/complete APIs
- Finding → Quality Case conversion

### Q2 — Operational hardening — SUBSTANTIALLY COMPLETE
- scheduler worker-ready processor
- cancellation/reschedule
- evidence metadata foundation
- finding ownership/due dates
- overdue processing

Remaining: richer inspection/evidence UI and concrete object-storage transport.

### Q3 — CAPA — BACKEND FOUNDATION COMPLETE
- CAPA lifecycle
- verification/effectiveness
- ineffective → rework → re-verification
- recurring finding/root-cause analytics support

Remaining: richer policy escalation and operational UI.

### Q4 — Branch Quality Score — BACKEND ENGINE COMPLETE
- versioned scoring policy
- immutable calculation runs
- dimension snapshots
- inspection/customer-feedback metric sources

Remaining: scheduled calculation, additional metric sources and branch/region cockpit.

### Q5 — Quality policy/catalog hardening — SUBSTANTIALLY COMPLETE
- configurable severity/SLA policy
- standard versioned inspection template catalog foundation
- recurring finding/root-cause analytics

Remaining: Quality operational UI completion and broader analytical views.

### L1 — LMS foundation — BACKEND FOUNDATION COMPLETE
- catalog/course/assignment
- immutable course versions and lessons
- theory exams and deterministic grading
- practical assessment
- final result snapshot
- certificate issuance/listing
- dedicated Training RBAC and assignment audit lifecycle

Remaining: programs, lesson-progress tracking, calendar, certificate renewal/revocation automation and LMS UI.

### L2 — Competency Management — BACKEND FOUNDATION COMPLETE
- competency definitions
- versioned competency profiles
- employee profile assignment
- time-aware assessment history
- employee competency-gap calculation

Remaining: explicit HR position mapping, recurring reviews and competency analytics/UI.

### L3 — Quality ↔ Training automation — FOUNDATION COMPLETE
- versioned Quality Finding rule engine
- explainable automated assignments
- cooldown/idempotency/audit behavior

Next: competency-gap assignment rules, Training → competency assessment integration and effectiveness feedback loop.

## 11. Architecture invariants

- Tenant/company/branch boundaries remain mandatory.
- RBAC and scope checks apply independently from workflow rules.
- Finding, Quality Case, CAPA, inspection lifecycle, Training assignment and score calculations remain auditable.
- Training/competency data is not a replacement for HR identity.
- Published Training content is immutable; changes require a new course version.
- Versioned Training assignments cannot be completed without a passing finalized result when assessment is required.
- Exam answer keys remain server-side grading data and are not returned from learner-facing published reads.
- Historical assessment, competency requirements and score snapshots remain immutable/auditable.
- Automation may recommend/assign workflows but must not silently invent compliance facts.
- `main` remains untouched until an explicit release/merge decision.
