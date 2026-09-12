# Quality → Training → Competency Checkpoint

Last verified: 2026-09-12

Branch: `feature/core-commerce-foundation`

This checkpoint records the verified backend and operational UI state of the Quality Management, Education & Development/LMS and Competency Management chain. It complements `QUALITY-AND-LEARNING-ROADMAP.md` and is the authoritative checkpoint for continuing Training/Competency work until the next full `docs/state/CURRENT-STATE.md` synchronization.

`main` remains untouched.

## 1. Verified implementation state

The active branch now contains the operational backend foundation for the Quality → Training → Competency loop plus the first manager-facing Learning Operations UI.

Implemented Training/Competency persistence and runtime now includes:

- Quality-driven Training rules and audited decisions
- competency definitions, profiles and immutable profile versions
- Training RBAC and assignment lifecycle/audit
- LMS course versions with publish/retire guards
- lessons and learner progress
- theory exams, deterministic grading and practical assessments
- Training result snapshots and competency result bridge
- competency-gap-driven Training assignment rules
- Training effectiveness measurement foundation
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
```

Latest verified checkpoint:

```text
b7c08a20639561be318379cf74242d1039ab9ae2
test(quality): cover score scheduler processor

Monorepo quality #835 — SUCCESS
```

The run passed Prisma validation/client generation, database/shared typecheck+build, API typecheck/test/build and web lint/typecheck/build.

## 2. Current Learning architecture

The current Training flow is:

```text
Training Course
      ↓
Immutable Published Course Version
      ↓
Lessons / Content / Progress
      ↓
Theory Exam + Practical Assessment
      ↓
Final Training Result
      ↓
Assignment Completion
      ↓
Certificate / Effectiveness Signal
      ↓
Training Compliance metric
      ↓
Branch Quality Score
      ↓
Scheduled Branch Quality Score run
```

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

## 5. Training planning lifecycle

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

## 6. Competency review and HR position mapping

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

## 7. Branch Quality Score — Training Compliance

`TRAINING_COMPLIANCE` is now a real Branch Quality Score metric source rather than a reserved/unsupported source.

The metric uses assignments due within the score period as its denominator. The numerator counts those assignments completed by the score period end. Assignments cancelled before the period end are excluded; a later cancellation does not rewrite the historical period semantics.

Optional `sourceKey` may scope the metric to a Training course code or course category.

No due assignment produces `NO_DATA` rather than an invented compliance score, allowing the configured score policy's missing-data strategy to remain authoritative.

Implementation commits:

```text
47fba58a2ce7f8e63881f651ab999bd61426254a
feat(quality): score training compliance

30e258d28c02ae1d3dc6c83e1e136540f42d576c
test(quality): cover training compliance metric
```

## 8. Scheduled Branch Quality Score processing

Branch Quality Score calculation can now be driven by persisted schedules instead of relying only on manual `/quality/scores/calculate` calls.

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

## 9. Learning Operations UI

The first operational UI increment is now available under `/training` and the `Gelişim` navigation group.

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
- manager start/complete assignment actions
- staff recurring-review history
- staff development-plan progress

The sidebar now exposes `Eğitim & Yetkinlik` and `Personel Gelişim Profilleri` under the permission-aware `Gelişim` section.

## 10. Isolation and integrity hardening

The Training planning and score scheduling layers preserve active branch isolation and semantic linkage.

### Calendar active-branch isolation

A branch-scoped request cannot provide another branch ID to the calendar read path.

### Enrollment assignment isolation

An optional calendar enrollment assignment is validated against:

- tenant
- company
- branch
- staff
- course
- open assignment lifecycle state
- course version when the session is pinned to a version

A foreign key alone is not treated as sufficient authorization/domain integrity.

### Planning lifecycle concurrency

Material session, enrollment and development-plan transitions execute inside serializable transactions with row locking where state transitions require it.

### Score scheduler concurrency

Due score schedules are leased through row-locked `SKIP LOCKED` claims. A retry after calculation but before schedule advancement detects the existing branch score for the same period and records an idempotent skip instead of creating a second scheduled score run.

## 11. Architecture invariants

- Tenant/company/branch isolation is mandatory on every read and mutation.
- `Staff`/employee and authenticated `User` remain separate concepts.
- Authorization Role and Competency Profile remain separate concepts.
- Published Training content is immutable; changes require a new version.
- Versioned assignments cannot bypass required assessment/result guards.
- Training assignments generated from Quality or Competency rules preserve their source rule/rationale.
- Exam answer keys remain server-side data and are not exposed in learner-facing reads.
- Certificate, result, competency assessment, review and effectiveness history remain auditable.
- Calendar enrollment must not link a staff member to another staff/branch/course/version assignment.
- Position mapping must not silently overwrite active employee competency-profile history.
- Branch Quality Score must not manufacture Training compliance when the reporting period has no eligible assignments.
- Scheduled score workers must not escape active branch scope by mutating TenantContext.
- Future AI recommendations may sit above these explainable signals but must not replace rule/audit foundations.

## 12. Correct continuation point

The previous roadmap wording that treated LMS, Competency Management, learning programs, lesson progress, certificate lifecycle, Training calendar, development plans, HR position mapping, recurring competency reviews, Training Compliance and scheduled Branch Quality Score calculation as future foundation work is stale.

The next increments should build on the existing backend and Learning Operations UI instead of recreating these foundations.

Recommended sequence:

```text
Training + Competency analytics and compliance dashboards
        ↓
Branch/region Quality + Training comparison cockpit
        ↓
Manager workflows for assessment/profile/review actions
        ↓
Reusable question-bank authoring
        ↓
Concrete object-storage integration for controlled documents/evidence
        ↓
Effectiveness feedback-loop expansion and additional explainable score metrics
```

Backend lifecycle, isolation, audit and concurrency invariants remain the gate for every UI/automation increment.
