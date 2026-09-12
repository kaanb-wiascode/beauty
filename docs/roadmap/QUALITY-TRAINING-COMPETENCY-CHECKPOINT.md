# Quality → Training → Competency Checkpoint

Last verified: 2026-09-12

Branch: `feature/core-commerce-foundation`

This checkpoint records the verified backend state of the Quality Management, Education & Development/LMS and Competency Management chain. It complements `QUALITY-AND-LEARNING-ROADMAP.md` and is the authoritative checkpoint for continuing Training/Competency work until the next full `docs/state/CURRENT-STATE.md` synchronization.

`main` remains untouched.

## 1. Verified implementation state

The active branch now contains the operational backend foundation for the Quality → Training → Competency loop rather than only the original Training/LMS foundation.

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
```

Latest verified backend checkpoint:

```text
ef95fae61e070ffef752685be00c53f5b5cc6acf
fix(training): satisfy planning transaction typecheck

Monorepo quality #821 — SUCCESS
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

## 8. Isolation and integrity hardening

The Training planning layer preserves active branch isolation and semantic assignment linkage.

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

## 9. Architecture invariants

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
- Future AI recommendations may sit above these explainable signals but must not replace rule/audit foundations.

## 10. Correct continuation point

The previous roadmap wording that treated LMS, Competency Management, learning programs, lesson progress, certificate lifecycle, Training calendar, development plans, HR position mapping, recurring competency reviews and Training Compliance as future foundation work is stale.

The next increments should build on the existing backend instead of recreating these foundations.

Recommended sequence:

```text
Learner / Manager / Training / Competency operational UI
        ↓
Training + Competency analytics and compliance dashboards
        ↓
Scheduled Branch Quality Score calculation worker
        ↓
Branch/region Quality + Training comparison cockpit
        ↓
Reusable question-bank authoring
        ↓
Concrete object-storage integration for controlled documents/evidence
        ↓
Effectiveness feedback-loop expansion and additional explainable score metrics
```

Backend lifecycle, isolation, audit and concurrency invariants remain the gate for every UI/automation increment.
