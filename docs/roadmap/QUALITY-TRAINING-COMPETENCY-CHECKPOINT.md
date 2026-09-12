# Quality → Training → Competency Checkpoint

Last verified: 2026-09-12

Branch: `feature/core-commerce-foundation`

This checkpoint records the verified backend state of the Quality Management, Education & Development/LMS and Competency Management chain. It complements `QUALITY-AND-LEARNING-ROADMAP.md` and is the authoritative checkpoint for continuing Training/Competency work until the next full `docs/state/CURRENT-STATE.md` synchronization.

`main` remains untouched.

## 1. Verified implementation state

The active branch has progressed substantially beyond the original foundation recorded by this file.

Implemented Training/Competency persistence now includes:

- Quality-driven Training rules and audited decisions
- competency definitions, profiles and immutable profile versions
- Training RBAC and assignment lifecycle/audit
- LMS course versions with publish/retire guards
- lessons and learner progress
- theory exams, deterministic grading and practical assessments
- Training result snapshots and competency result bridge
- competency-gap-driven Training assignment rules
- Training effectiveness measurement foundation
- certificate lifecycle and issuance audit
- multi-course learning programs
- Training calendar/session enrollment
- employee development plans

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
```

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
```

Programs can group multiple courses. Calendar sessions can schedule classroom/operational delivery and enroll staff. Development plans can contain competency, course, program or action items.

Training remains a separate bounded context integrated with HR, Quality and Competency rather than being embedded into those domains.

## 3. Current Competency architecture

```text
Competency Definition
      ↓
Immutable Competency Profile Version
      ↓
Effective-dated Staff Profile Assignment
      ↓
Assessment History
      ↓
Gap Calculation
      ↓
Versioned Competency → Training Rule
      ↓
Training Recommendation / Assignment
```

Competency assessment history is append-only/time-aware. Historical requirements and results must not be rewritten when a competency profile changes.

Authorization Roles and Competency Profiles remain separate concepts.

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

## 5. Training calendar and development plans

Calendar/session persistence is implemented with:

- `training_sessions`
- `training_session_enrollments`
- capacity control
- session lifecycle/status foundation
- published course-version pinning when available
- staff enrollment

Development-plan persistence is implemented with:

- `staff_development_plans`
- `staff_development_plan_items`
- `staff_development_plan_events`
- competency/course/program/action plan items
- auditable creation and item-addition events

## 6. Isolation and integrity hardening — 2026-09-12

The latest continuation pass identified and fixed two scope weaknesses in the newly added Training planning layer.

### Calendar active-branch isolation

A branch-scoped request could previously provide another `branchId` to the calendar read path. The service now rejects a requested branch that differs from the active tenant context branch before issuing the database query.

Commits:

```text
640c1c3020ac61d9fc416ac751d63ef18156de42
fix(training): enforce calendar branch scope

65e007e2809988907af432b27f4cdab5bb27602e
test(training): protect calendar branch isolation
```

### Enrollment assignment isolation

`training_session_enrollments.assignment_id` is a foreign key to `training_assignments`, but that foreign key alone does not prove that the assignment belongs to the same tenant/company/branch/staff/course as the enrollment.

The enrollment service now validates an optional assignment against:

- tenant
- company
- branch
- staff
- course
- open assignment lifecycle state (`ASSIGNED` / `IN_PROGRESS`)
- course version when the session is pinned to a published version

An assignment that does not match the session enrollment scope is rejected before the enrollment insert/update.

Commits:

```text
fceec58f622ab5c027e204b006182d7db8c65cd0
fix(training): validate session assignment scope

f87d3ea64f4bac489a987124e07f4668ac790f9d
test(training): cover assignment enrollment isolation
```

## 7. Architecture invariants

- Tenant/company/branch isolation is mandatory on every read and mutation.
- `Staff`/employee and authenticated `User` remain separate concepts.
- Authorization Role and Competency Profile remain separate concepts.
- Published Training content is immutable; changes require a new version.
- Versioned assignments cannot bypass required assessment/result guards.
- Training assignments generated from Quality or Competency rules preserve their source rule/rationale.
- Exam answer keys remain server-side data and are not exposed in learner-facing reads.
- Certificate, result, competency assessment and effectiveness history remain auditable.
- Calendar enrollment must not link a staff member to another staff/branch/course/version assignment.
- Future AI recommendations may sit above these explainable signals but must not replace rule/audit foundations.

## 8. Correct continuation point

The previous roadmap wording that treated LMS, Competency Management, learning programs, lesson progress, certificate lifecycle, Training calendar and development plans as future foundation work is stale.

The next Training/Competency increments should build on the existing implementation rather than recreate it.

Recommended sequence:

```text
Training calendar/session lifecycle hardening
        ↓
Attendance / no-show / cancellation APIs and audit events
        ↓
Development-plan item/status lifecycle + completion rules
        ↓
HR position/role → competency-profile mapping
        ↓
Recurring competency review schedules
        ↓
Training compliance → Branch Quality Score real metric source
        ↓
Learner / Manager / Training / Competency UI
        ↓
Analytics and effectiveness feedback loop expansion
```

Before broad UI expansion, session and development-plan lifecycle transitions should receive the same concurrency, idempotency, audit and branch-scope rigor already used in the rest of the platform.
