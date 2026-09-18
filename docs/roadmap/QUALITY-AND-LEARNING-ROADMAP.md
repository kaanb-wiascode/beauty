# VALOO — Quality Management & Learning Roadmap

Last updated: 2026-09-12

This document is the execution roadmap for Quality Management, Branch Inspections and the Learning/Competency bounded context. It supplements `docs/state/CURRENT-STATE.md` and must remain aligned with the active development branch.

## 1. Verified baseline

Active branch: `feature/core-commerce-foundation`

Latest verified Quality + Training backend checkpoint:

```text
ef95fae61e070ffef752685be00c53f5b5cc6acf
fix(training): satisfy planning transaction typecheck
Monorepo quality #821 — SUCCESS
```

The verified workflow passed Prisma validation/client generation, database/shared package typecheck+build, API typecheck/test/build and web lint/typecheck/build.

The active branch now has an operational backend chain across Quality, LMS/Training and Competency rather than only foundation placeholders.

## 2. Quality Management architecture

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

Implemented Quality capabilities include:

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
- versioned Branch Quality Score policies and immutable calculation runs
- planned-inspection cancellation/reschedule audit lifecycle
- recurring finding/root-cause analytics foundation
- Quality Finding → Training rule automation

Do not create parallel complaint, finding or corrective-action systems for hygiene, camera, documentation, product verification or other inspection categories.

## 3. Branch Inspection operational foundation

Implemented:

- versioned inspection templates
- checklist items with required/optional behavior and weighting
- periodic branch schedules
- worker-ready due-schedule processor with lease + `FOR UPDATE SKIP LOCKED`
- deterministic idempotent schedule occurrences
- `PLANNED → IN_PROGRESS → COMPLETED`
- explicit `PLANNED → CANCELLED`
- audited reschedule
- per-item results
- findings linked to inspection/results
- finding ownership/due-date foundation
- concurrency-safe Finding → Quality Case conversion
- controlled evidence metadata
- tenant/company/branch isolation
- `quality.read` / `quality.manage` RBAC
- assignee/inspector membership-scope validation
- serializable transactions and row locking for material transitions

The inspection engine intentionally remains generic enough for service quality, cleaning/hygiene, camera/control-room, employee experience, documentation/compliance and product-use verification audits.

## 4. CAPA

Implemented backend lifecycle:

```text
OPEN → IN_PROGRESS → VERIFICATION → EFFECTIVE → CLOSED
                         ↓
                    INEFFECTIVE
                         ↓
                    IN_PROGRESS
```

An ineffective CAPA can return to rework and then be re-verified. Historical transitions remain in `quality_capa_events`.

Remaining CAPA work is primarily richer escalation policy, branch/region analytics and operational UI rather than lifecycle persistence.

## 5. Branch Quality Score

The score is backed by a versioned, explainable policy engine.

Implemented persistence:

- `quality_score_policies`
- `quality_score_policy_dimensions`
- `quality_score_penalty_rules`
- `branch_quality_score_runs`
- `branch_quality_score_dimension_runs`
- `branch_quality_scores`

Implemented metric sources:

- `INSPECTION_CATEGORY`
- `CUSTOMER_FEEDBACK`
- `TRAINING_COMPLIANCE`

Reserved source kind:

- `CUSTOM_METRIC`

### Training Compliance semantics

Training Compliance now uses real `training_assignments` data.

For a score period:

- denominator = assignments due during the period
- numerator = those assignments completed by period end
- assignments cancelled before period end are excluded
- later cancellation does not retroactively change the historical reporting-period rule
- optional `sourceKey` can restrict the metric to a course code or course category
- no eligible assignment returns `NO_DATA`; the score policy's missing-data strategy decides how that affects the final score

This preserves explainability and avoids inventing compliance facts.

Remaining score extensions:

- CAPA effectiveness metric source
- SLA compliance metric source
- recurring-finding metric source
- branch/region comparison cockpit
- scheduled calculation worker

## 6. Evidence

Evidence metadata supports Inspection, Inspection Result, Finding, Quality Case and CAPA.

The database stores opaque object references and controlled metadata rather than treating public/signed URLs as domain truth. A concrete object-storage provider remains an infrastructure integration.

## 7. Education & Development / LMS bounded context

Education & Development is implemented as a separate main module integrated with HR, Quality and Competency.

Implemented backend capabilities now include:

- Training course catalog
- dedicated `training.read` / `training.manage` RBAC
- manual, Quality-rule and competency-gap-driven assignments
- assignment lifecycle, expiry and audit events
- immutable course releases with `DRAFT → PUBLISHED → RETIRED`
- assignment pinning to published course versions
- versioned lessons/content
- learner lesson-progress tracking
- theory exams with deterministic server-side grading
- practical assessments
- final Training result snapshots
- completion guards when assessments are required
- certificate issuance and audit
- certificate expiry processing
- certificate revocation
- certificate renewal assignment workflow
- multi-course learning programs
- Training calendar and scheduled sessions
- scoped staff enrollment
- session start/completion/cancellation lifecycle
- attendance / no-show / enrollment cancellation
- session audit events
- employee development plans
- development-plan item lifecycle and plan completion guards

Current learning chain:

```text
Course
  ↓
Immutable Course Version
  ↓
Lessons / Progress
  ↓
Theory + Practical Assessment
  ↓
Final Result
  ↓
Assignment Completion
  ↓
Certificate / Effectiveness
  ↓
Training Compliance
  ↓
Branch Quality Score
```

Remaining LMS work is no longer basic persistence. Priority gaps are:

- learner / manager / Training operational UI
- Training analytics and compliance dashboards
- reusable question-bank authoring beyond version-local questions
- richer classroom/session management UX
- concrete controlled-document object-storage integration

## 8. Competency Management

Implemented chain:

```text
Competency Definition
  ↓
Immutable Competency Profile Version
  ↓
HR Position Mapping / Staff Profile Assignment
  ↓
Assessment History
  ↓
Gap
  ↓
Versioned Competency → Training Rule
  ↓
Training Assignment
  ↓
Training Result → Competency Assessment
  ↓
Recurring Competency Review
```

Implemented behaviors:

- company-scoped competency definitions
- competency profiles with required levels and weights
- immutable/versioned profile revisions
- effective-dated staff profile assignments
- time-aware competency assessments
- assessment source types: MANUAL, EXAM, PRACTICAL, TRAINING, QUALITY
- current competency-gap calculation
- versioned competency-gap → Training assignment rules
- minimum-gap threshold, priority, due-days and cooldown policy
- recommendation preview
- advisory locking for concurrent gap processing
- deterministic assignment source keys
- effective published LMS-version requirement
- independent competency automation audit stream
- Training completion/result → competency assessment bridge
- recurring competency review schedules
- due-review processing
- review completion/cancellation audit
- fresh-assessment completion guards
- HR `employee_profiles.position` → versioned competency-profile mapping
- idempotent mapping processor that does not silently overwrite an active staff competency profile

Relevant latest migrations:

```text
20260912180000_training_planning_lifecycle
20260912190000_competency_recurring_reviews
20260912193000_position_competency_mapping
```

Remaining competency work:

- employee/role/branch competency analytics and UI
- manager review cockpit
- richer review reminders/escalations
- competency trend/effectiveness reporting

Competency records must remain time-aware and auditable. Historical results and requirements must never be silently overwritten when requirements or assessment methods change.

## 9. Quality ↔ Training automation

The automation layer is rule-based, versioned and explainable rather than AI-driven.

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
- rationale with rule/version/occurrence/evidence references
- audited assignment/skip decisions
- no invented employee identity

Implemented Competency Gap → Training support:

- versioned competency-to-course rules
- minimum gap threshold and priority ordering
- due/cooldown policy
- recommendation preview
- serialized staff processing
- effective published course-version requirement
- deterministic evidence-aware source key
- assignment rationale snapshot
- independent audit stream from Quality rules

Implemented Training → Competency support:

- finalized Training results can produce competency assessment evidence through the existing result bridge
- historical result/assessment provenance is retained

Examples still suitable for configurable future rules:

- repeated hygiene finding → mandatory hygiene refresher
- repeated service-protocol failure → practical reassessment
- complaint-category threshold → customer-communication training
- expired certificate → eligibility warning
- CAPA requiring behavioral change → learning path + effectiveness recheck

No hardcoded employee penalty or disciplinary decision should be derived automatically from a single quality signal.

## 10. Revised execution order

### Quality backend — ADVANCED / OPERATIONAL FOUNDATION COMPLETE

Core inspection, Finding, Quality Case, CAPA, evidence, SLA and score-engine foundations exist.

Next Quality increments:

- scheduled Branch Quality Score processing
- additional real score sources
- branch/region comparison cockpit
- richer operational UI
- concrete evidence object-storage transport

### LMS backend — ADVANCED FOUNDATION COMPLETE

Catalog, course versioning, lesson progress, assessments, result, certificates, learning programs, calendar/session lifecycle and development plans are implemented.

Next LMS increments:

- learner/manager/Training UI
- analytics/compliance dashboards
- reusable question bank
- richer operational scheduling UX

### Competency backend — ADVANCED FOUNDATION COMPLETE

Definitions, immutable profiles, effective assignment, gap engine, Training bridge, recurring reviews and HR position mapping are implemented.

Next Competency increments:

- employee/manager competency cockpit
- branch/role analytics
- review reminder/escalation automation
- longitudinal effectiveness views

### Quality ↔ Training ↔ Competency loop — BACKEND INTEGRATION ESTABLISHED

The backend now supports:

```text
Quality Finding
      ↓
Training Assignment
      ↓
Training Result
      ↓
Competency Evidence
      ↓
Recurring Review / Gap
      ↓
Training Assignment

Training Compliance
      ↓
Branch Quality Score
```

The next emphasis is operational UX, reporting and scheduler orchestration rather than recreating domain foundations.

## 11. Architecture invariants

- Tenant/company/branch boundaries remain mandatory.
- RBAC and scope checks apply independently from workflow rules.
- Finding, Quality Case, CAPA, inspection, Training assignment/session, competency review and score calculations remain auditable.
- Training/competency data is not a replacement for HR identity.
- Authorization Role and Competency Profile remain separate concepts.
- Quality Training rules and Competency Training rules keep separate rule identities/audit streams.
- Published Training content is immutable; changes require a new course version.
- Versioned assignments cannot bypass required assessment/result guards.
- Automated competency-gap assignments require an effective published course version.
- Exam answer keys remain server-side grading data.
- Historical assessment, competency requirements and score snapshots remain immutable/auditable.
- Position mapping must not silently overwrite active staff competency-profile history.
- Training Compliance must return no-data rather than inventing a score when no eligible assignments exist.
- Automation may recommend or assign workflows but must not invent compliance facts or disciplinary conclusions.
- `main` remains untouched until an explicit release/merge decision.
