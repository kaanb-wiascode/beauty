# Quality → Training → Competency Checkpoint

Last verified: 2026-09-12

Branch: `feature/core-commerce-foundation`

This checkpoint records the verified backend and operational UI state of the Quality Management, Education & Development/LMS and Competency Management chain. It complements `QUALITY-AND-LEARNING-ROADMAP.md` and is the authoritative checkpoint for continuing Training/Competency work until the next full `docs/state/CURRENT-STATE.md` synchronization.

`main` remains untouched.

## 1. Verified implementation state

The active branch now contains the operational backend foundation for the Quality → Training → Competency loop plus manager-facing Learning Operations, analytics, comparison and LMS authoring UI.

Implemented Training/Competency persistence and runtime now includes:

- Quality-driven Training rules and audited decisions
- competency definitions, profiles and immutable profile versions
- Training RBAC and assignment lifecycle/audit
- LMS course versions with publish/retire guards
- lessons and learner progress
- theory exams, deterministic grading and practical assessments
- versioned reusable question bank with immutable exam snapshots
- private S3-compatible object storage abstraction for controlled Quality evidence and LMS documents
- Training result snapshots and competency result bridge
- competency-gap-driven Training assignment rules
- Training effectiveness measurement foundation
- auditable Training effectiveness manager follow-up lifecycle
- explainable `TRAINING_EFFECTIVENESS` Branch Quality Score metric
- certificate lifecycle, expiry, renewal, revocation and audit
- multi-course learning programs
- Training calendar/session enrollment
- Training session attendance/no-show/cancellation lifecycle and audit
- employee development plans with item and plan lifecycle guards
- recurring competency review schedules and review audit
- HR position → competency-profile mapping
- real Training Compliance metric source in Branch Quality Score
- branch-scoped scheduled Branch Quality Score processing with lease/idempotency/audit
- Learning Operations manager cockpit
- staff development directory and staff-level competency/training drill-down
- Training + Competency analytics dashboard and explainable staff risk ranking
- multi-branch Quality + Training comparison cockpit
- manager competency profile/assessment/review workflows
- question-bank authoring UI restricted to `training.manage`

Relevant migration sequence on the active branch:

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
```

Latest verified code checkpoint:

```text
9178103b375800081a22b8086549f807182d626a
feat(quality): allow training effectiveness score source

Monorepo quality #882 — SUCCESS
```

The run passed dependency installation, Prisma validation/client generation, database/shared typecheck+build, API typecheck/tests/build and web lint/typecheck/build.

Earlier verified checkpoints in the same sequence include private object storage + Quality/LMS managed documents (`Monorepo quality #874 — SUCCESS`) and effectiveness follow-up lifecycle (`Monorepo quality #879 — SUCCESS`).

## 2. Current Learning architecture

The current Training flow is:

```text
Training Course
      ↓
Immutable Published Course Version
      ↓
Lessons / Private Controlled Content / Progress
      ↓
Theory Exam + Practical Assessment
      ↓
Final Training Result
      ↓
Assignment Completion
      ↓
Certificate / Effectiveness Signal
      ↓
Training Compliance + Training Effectiveness metrics
      ↓
Branch Quality Score
      ↓
Scheduled Branch Quality Score run
```

Exam authoring additionally supports:

```text
Versioned Question Bank Item
      ↓
DRAFT → PUBLISHED → RETIRED
      ↓
Published Bank Question
      ↓
Copy into Draft Exam
      ↓
Immutable Exam Question Snapshot
      ↓
Source question-bank id/version retained for traceability
```

A later question-bank revision does not rewrite a previously authored exam question or grading key.

Programs can group multiple courses. Calendar sessions can schedule classroom/operational delivery and enroll staff. Development plans can contain competency, course, program or action items.

Training remains a separate bounded context integrated with HR, Quality and Competency rather than being embedded into those domains.

## 3. Current Competency architecture

```text
Competency Definition
      ↓
Immutable Competency Profile Version
      ↓
HR Position Mapping / Effective Staff Profile Assignment
      ↓
Assessment History
      ↓
Gap Calculation
      ↓
Versioned Competency → Training Rule
      ↓
Training Recommendation / Assignment
      ↓
Training Result → Competency Assessment Bridge
      ↓
Recurring Competency Review
```

Competency assessment history is append-only/time-aware. Historical requirements and results must not be rewritten when a competency profile changes.

Authorization Roles and Competency Profiles remain separate concepts.

The existing HR source of position truth is `employee_profiles.position`; a parallel position master was intentionally not introduced. Position mappings normalize that value and bind it to an effective, versioned competency profile. Automatic processing does not overwrite an existing active staff competency profile silently.

## 4. Quality → Training automation

Quality-driven Training automation is rule-based, versioned and explainable.

Current rule processing preserves:

- source Quality evidence/rationale
- rule version
- occurrence threshold
- lookback window
- cooldown/idempotency behavior
- tenant/company/branch scope
- target scope (`BRANCH` or `STAFF`)
- audit decisions for assignment creation and skips

The system must not infer staff identity when Quality evidence does not provide a valid staff relationship. No disciplinary/legal HR action may be automated from a single Quality signal.

## 5. Private controlled document and evidence storage

Quality Evidence and LMS document content now share a private, S3-compatible storage abstraction rather than storing public/signed URLs in domain tables.

The storage adapter supports AWS S3 and compatible private object stores through environment configuration. Credentials remain runtime configuration and are never stored in evidence/content rows or returned in API responses.

### Quality Evidence

Managed Quality Evidence upload flow is:

```text
Scoped Quality Subject
      ↓
Server-generated private object key
      ↓
Short-lived signed PUT
      ↓
Object upload
      ↓
HEAD verification
      ↓
Verified size/MIME + opaque object_key persisted
      ↓
Scoped short-lived signed GET when requested
```

The generated object-key namespace contains tenant/company/branch/subject scope. Finalization rejects an object key outside the expected subject prefix, verifies that the object exists, uses storage metadata rather than client-declared size/MIME, and removes an oversized managed object before refusing registration.

Quality Evidence APIs include:

- `POST /quality/evidence/uploads/prepare` — `quality.manage`
- `POST /quality/evidence/uploads/finalize` — `quality.manage`
- `GET /quality/evidence/:id/download` — `quality.read`

Existing opaque-key evidence registration remains available for compatible internal integrations; HTTP(S) URLs remain forbidden as `objectKey` values.

### LMS controlled documents

Draft course versions can request managed private document uploads under a course/version-scoped namespace. Uploaded content can be HEAD-verified before its opaque `contentRef` is linked to a `DOCUMENT` lesson. Learner/manager download requests resolve by lesson ID and return a short-lived signed URL only after tenant/company/content-type and managed-prefix checks.

LMS document APIs include:

- `POST /training/content/versions/:versionId/documents/prepare` — `training.manage`
- `POST /training/content/versions/:versionId/documents/verify` — `training.manage`
- `GET /training/content/lessons/:lessonId/document` — `training.read`

Published content immutability remains authoritative. Storage URLs are delivery artifacts, not persisted domain identity.

## 6. Training planning lifecycle

Calendar/session persistence and lifecycle now includes:

- `training_sessions`
- `training_session_enrollments`
- `training_session_events`
- capacity control
- published course-version pinning when available
- scoped staff enrollment
- `SCHEDULED → IN_PROGRESS → COMPLETED`
- explicit session cancellation
- enrollment attendance / no-show / cancellation transitions
- append-only audit events for material session/enrollment transitions

Development-plan persistence and lifecycle now includes:

- `staff_development_plans`
- `staff_development_plan_items`
- `staff_development_plan_events`
- competency/course/program/action plan items
- item status transitions
- plan completion guard requiring all items to be completed or cancelled
- auditable lifecycle events

## 7. Competency review and HR position mapping

Recurring competency reviews are persisted separately from competency assessments so the system can distinguish review obligation from evidence/result history.

Implemented review behavior includes:

- recurring schedule definitions
- due-review processing
- branch/company scoping
- concurrency-safe claiming/processing
- duplicate-open-review prevention
- explicit review completion/cancellation
- audit events
- completion guard requiring fresh competency assessment evidence for profile requirements

Position mapping provides:

```text
employee_profiles.position
        ↓
normalized Position → Competency Profile Mapping
        ↓
active versioned Competency Profile
        ↓
Staff Competency Profile Assignment
```

The processor is idempotent with respect to an employee who already has an active competency profile and records assignment/skip decisions instead of silently replacing profile history.

Manager UI exposes governed backend actions from the staff drill-down without bypassing backend guards:

- competency-profile assignment
- append-only manual competency assessment
- recurring-review completion
- recurring-review cancellation with reason
- Training assignment start/complete

Review completion remains blocked until fresh assessment evidence exists for all profile requirements after the review opened.

## 8. Branch Quality Score — Training Compliance

`TRAINING_COMPLIANCE` is a real Branch Quality Score metric source rather than a reserved/unsupported source.

The metric uses assignments due within the score period as its denominator. The numerator counts those assignments completed by the score period end. Assignments cancelled before the period end are excluded; a later cancellation does not rewrite the historical period semantics.

Optional `sourceKey` may scope the metric to a Training course code or course category.

No due assignment produces `NO_DATA` rather than an invented compliance score, allowing the configured score policy's missing-data strategy to remain authoritative.

## 9. Training Effectiveness feedback loop and Quality Score

Training effectiveness remains evidence-based: completed assignments can be evaluated against before/after Quality finding windows and produce `IMPROVED`, `STABLE`, `WORSE` or `INSUFFICIENT_BASELINE` outcomes.

Non-improving or data-insufficient outcomes can now be converted into auditable manager follow-ups without creating disciplinary or legal HR actions automatically:

```text
WORSE
  → HIGH / INVESTIGATE_ROOT_CAUSE

STABLE
  → NORMAL / REASSESS_COMPETENCY

INSUFFICIENT_BASELINE
  → NORMAL / REVIEW_BASELINE_DATA
```

Follow-ups use `OPEN → ACKNOWLEDGED → RESOLVED` lifecycle, with explicit cancellation, row locking, serializable transitions, actor/timestamp history and append-only events. Resolution and cancellation require a note/reason. The persisted rationale explicitly marks `automaticDecision=false` and `managerReviewRequired=true`.

`TRAINING_EFFECTIVENESS` is also a valid Branch Quality Score source. For a reporting period:

- effectiveness runs are selected by `post_window_end`
- tenant/company/branch scope is mandatory
- optional `sourceKey` filters by Training course code or category
- `INSUFFICIENT_BASELINE` is excluded from the evaluable denominator
- numerator is `IMPROVED`
- score is `IMPROVED / evaluable × 100`
- no evaluable runs returns `NO_DATA` instead of fabricating a score

This metric measures effectiveness evidence; manager follow-up task status does not alter the historical effectiveness score.

## 10. Scheduled Branch Quality Score processing

Branch Quality Score calculation can be driven by persisted schedules instead of relying only on manual `/quality/scores/calculate` calls.

Implemented scheduler behavior includes:

- `quality_score_schedules`
- `quality_score_schedule_events`
- branch-context requirement
- `DAILY`, `WEEKLY`, `MONTHLY` cadence
- `PREVIOUS_DAY`, `PREVIOUS_WEEK`, `PREVIOUS_MONTH` period derivation
- optional explicit score policy pinning
- due schedule claiming with `FOR UPDATE SKIP LOCKED`
- worker lease ownership and expiry
- same-period idempotency using existing branch score state
- successful calculation audit
- existing-score skip audit
- failed-run audit with lease release and retained error
- schedule advancement after successful/duplicate processing

The first scheduler increment is intentionally branch-scoped. It does not mutate request TenantContext to impersonate other branches. A future central/platform multi-branch worker must use an explicit privileged execution model rather than bypassing branch isolation.

## 11. Learning Operations and analytics UI

Operational UI is available under `/training` and the permission-aware `Gelişim` navigation group.

Implemented UI surfaces include:

- Learning Operations cockpit
- Training assignment summary
- upcoming Training session/calendar view
- development-plan progress
- active LMS course catalog
- competency profile governance summary
- recurring competency review visibility
- manager actions for expired assignments, Quality→Training rules and due competency reviews
- staff development directory at `/training/staff`
- staff drill-down at `/training/staff/[staffId]`
- staff competency gap analysis
- staff Training assignment lifecycle visibility
- manager profile assignment/manual assessment/review complete/cancel actions
- staff recurring-review history
- staff development-plan progress
- Learning Analytics at `/training/analytics`
- Training completion/overdue metrics
- competency-gap and review-backlog metrics
- persisted Training Compliance trend from Branch Quality Score
- explainable staff development risk ranking
- reusable question-bank authoring at `/training/question-bank`

Question-bank authoring is restricted to `training.manage` because correct-answer keys are manager/server-side authoring data and must not be exposed through learner-facing reads.

## 12. Multi-branch Quality + Training comparison

The company-level comparison cockpit is available at `/quality/comparison` when the user has both `quality.read` and `training.read`.

The UI combines existing bounded-context branch signals by `branchId` instead of inventing a hidden aggregate score:

- persisted latest Branch Quality Score
- Training Compliance
- average inspection score
- high/critical finding count
- Training completion rate
- overdue Training assignments
- competency-gap count
- overdue competency reviews

Quality score values are read from persisted `branch_quality_scores`; the comparison read path does not recalculate scores.

A Region entity/domain does not currently exist in the repository. Region-level aggregation is intentionally not fabricated from branch names or addresses. Region comparison remains pending until an explicit Region domain and branch-to-region relationship are introduced.

## 13. Reusable question-bank architecture

Question-bank persistence includes `training_question_bank_questions` with tenant/company scope, stable question code, version number, `DRAFT/PUBLISHED/RETIRED` lifecycle, type/category/tags, answer key and default points.

Important guarantees:

- one published version per tenant/company/question code
- new versions are created rather than rewriting published versions
- publish retires the previous published version of the same code
- only published bank items can be inserted into an exam
- target exam must belong to a DRAFT course version
- inserting a bank question copies prompt/options/correct answer/points into `training_exam_questions`
- `question_bank_id` and `question_bank_version` preserve provenance
- later bank revisions do not rewrite historical exam snapshots
- bank authoring/list reads require `training.manage`; learner-facing reads do not expose answer keys

## 14. Isolation and integrity hardening

The Training planning, analytics, storage, score scheduling, effectiveness and authoring layers preserve tenant/company/branch isolation and semantic linkage.

### Calendar active-branch isolation

A branch-scoped request cannot provide another branch ID to the calendar read path.

### Enrollment assignment isolation

An optional calendar enrollment assignment is validated against tenant, company, branch, staff, course, open assignment lifecycle state and course version when the session is pinned to a version.

A foreign key alone is not treated as sufficient authorization/domain integrity.

### Planning lifecycle concurrency

Material session, enrollment and development-plan transitions execute inside serializable transactions with row locking where state transitions require it.

### Score scheduler concurrency

Due score schedules are leased through row-locked `SKIP LOCKED` claims. A retry after calculation but before schedule advancement detects the existing branch score for the same period and records an idempotent skip instead of creating a second scheduled score run.

### Analytics scope

Learning analytics preserve active request tenant/company/branch scope. Central company context may compare branches within that company; branch context remains restricted to the active branch.

### Controlled storage integrity

Managed object keys are server generated under scoped namespaces. Finalization/verification checks expected prefixes and storage metadata before registration/use. Signed URLs are short-lived delivery artifacts and are never persisted as evidence/content identity. Credentials remain runtime configuration.

### Effectiveness follow-up concurrency

Due effectiveness results are claimed with `FOR UPDATE ... SKIP LOCKED`; one follow-up is allowed per tenant/company/effectiveness run. Lifecycle transitions row-lock the follow-up inside serializable transactions and append audit events.

### Question-bank authoring integrity

Question version allocation is advisory-lock protected. Publish and exam-copy operations use serializable transactions, and exam insertion is restricted to draft course versions.

## 15. Architecture invariants

- Tenant/company/branch isolation is mandatory on every read and mutation.
- `Staff`/employee and authenticated `User` remain separate concepts.
- Authorization Role and Competency Profile remain separate concepts.
- Published Training content is immutable; changes require a new version.
- Published reusable questions are versioned; exam content stores an immutable snapshot.
- Versioned assignments cannot bypass required assessment/result guards.
- Training assignments generated from Quality or Competency rules preserve their source rule/rationale.
- Exam answer keys remain server-side/manager-authoring data and are not exposed in learner-facing reads.
- Private evidence/content stores opaque object keys, not public or signed URLs.
- Storage credentials must remain runtime secrets and must never be persisted in domain rows or API payloads.
- Certificate, result, competency assessment, review, effectiveness and follow-up history remain auditable.
- Effectiveness results may create manager-review obligations but must not automatically create disciplinary/legal HR decisions.
- Calendar enrollment must not link a staff member to another staff/branch/course/version assignment.
- Position mapping must not silently overwrite active employee competency-profile history.
- Branch Quality Score must not manufacture Training compliance or effectiveness when the reporting period has no eligible/evaluable evidence.
- Scheduled score workers must not escape active branch scope by mutating TenantContext.
- Comparison dashboards must display explainable domain metrics instead of manufacturing opaque composite scores.
- Region reporting must not be simulated before a real Region domain exists.
- Future AI recommendations may sit above these explainable signals but must not replace rule/audit foundations.

## 16. Correct continuation point

The previous roadmap wording that treated LMS, Competency Management, learning programs, lesson progress, certificate lifecycle, Training calendar, development plans, HR position mapping, recurring competency reviews, Training Compliance, Learning Analytics, comparison cockpit, reusable question-bank authoring, controlled Quality/LMS object storage and first effectiveness feedback-loop foundation as future work is stale.

The next increments should build on the verified foundations instead of recreating them.

Recommended sequence:

```text
Manager UI for effectiveness follow-ups and controlled evidence/document upload
        ↓
Strict managed-storage linkage for LMS DOCUMENT authoring flows
        ↓
Additional explainable Quality/Training metrics and analytics trends
        ↓
Explicit Region domain + branch-to-region relationship before region reporting
        ↓
Full docs/state and roadmap synchronization
```

Backend lifecycle, isolation, audit, storage and concurrency invariants remain the gate for every UI/automation increment.
