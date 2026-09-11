# Quality → Training → Competency Checkpoint

Last verified: 2026-09-12

Branch: `feature/core-commerce-foundation`

This checkpoint records the newly implemented backend bridge between Quality Management, Education & Development/LMS and Competency Management. It complements `QUALITY-AND-LEARNING-ROADMAP.md` and should be merged into `docs/state/CURRENT-STATE.md` during the next full documentation synchronization.

## Verified commits

- `202a836d3783eeac198ae79d7c9f8cd5aed33e48` — `feat(quality): add recurring issue analytics` — Monorepo quality #752 SUCCESS
- `ea981c06d30e2cdad8b93d5c4680fd2171a510c4` — `feat(training): add quality driven training rules` — Monorepo quality #753 SUCCESS
- `18e857cfb21a7c016d7feaa394634fcf3496d1db` — `feat(training): add competency profile foundation` — Monorepo quality #754 SUCCESS

`main` was not modified.

## 1. Quality recurring analytics

Read-only Quality analytics now operate on existing Finding, CAPA and Inspection domain records; no parallel quality-case persistence was introduced.

Endpoints:

```text
GET /quality/analytics/recurring-findings
GET /quality/analytics/root-causes
GET /quality/analytics/branch-signals
```

Capabilities:

- recurring Finding grouping by branch/category/severity
- occurrence, open and escalation counts
- first/last seen timestamps
- normalized monthly frequency
- normalized CAPA root-cause pattern grouping
- effective/ineffective CAPA counts
- branch signals for Finding risk, CAPA effectiveness and inspection score
- tenant/company/branch scope enforcement

These signals are intended to support operations, Quality policy decisions, Branch Quality Score inputs and explainable Training recommendations.

## 2. Training bounded context foundation

Training is implemented as a separate API module rather than being embedded in Quality or HR.

Persistence:

- `training_courses`
- `training_assignments`
- `quality_training_rules`
- `quality_training_rule_events`

Current course categories:

- SERVICE
- SALES
- CUSTOMER_EXPERIENCE
- CORPORATE
- MANAGEMENT
- QUALITY
- OTHER

Delivery types:

- THEORY
- PRACTICAL
- BLENDED

Current endpoints:

```text
GET  /training/courses
POST /training/courses
GET  /training/quality-rules
POST /training/quality-rules
POST /training/quality-rules/process
GET  /training/assignments
```

The first iteration temporarily reuses `quality.read` / `quality.manage` authorization for the Quality-driven training bridge. Dedicated Training permissions remain a later hardening task and must be introduced without weakening tenant/company/branch scope.

## 3. Explainable Quality → Training rules

The first automation layer is rule-based rather than AI-driven.

A rule can define:

- course
- Finding category
- minimum severity
- occurrence threshold
- lookback window
- cooldown window
- target scope (`BRANCH` or `STAFF`)
- effective date window
- version

Processor behavior:

```text
Quality Findings
      ↓
Rule match within lookback window
      ↓
Occurrence threshold reached
      ↓
Cooldown/idempotency check
      ↓
Training Assignment
      ↓
Immutable-ish rationale + rule event audit trail
```

For `STAFF` targeting, the processor only assigns a person when an actual staff link is available through the established Quality Case relationship. It does not infer or fabricate employee attribution. Missing attribution is recorded as `NO_ELIGIBLE_STAFF`.

Audit event types currently include:

- MATCHED (reserved in persistence)
- ASSIGNMENT_CREATED
- SKIPPED_COOLDOWN
- NO_ELIGIBLE_STAFF

## 4. Competency Management foundation

Authorization roles are deliberately not reused as HR/job competency roles. Competency Profiles are a separate domain concept.

Persistence:

- `competency_definitions`
- `competency_profiles`
- `competency_profile_requirements`
- `staff_competency_profiles`
- `staff_competency_assessments`

Assessment sources:

- MANUAL
- EXAM
- PRACTICAL
- TRAINING
- QUALITY

Endpoints:

```text
GET  /training/competencies/definitions
POST /training/competencies/definitions
GET  /training/competencies/profiles
POST /training/competencies/profiles
POST /training/competencies/staff/:staffId/profile
POST /training/competencies/staff/:staffId/assessments
GET  /training/competencies/staff/:staffId/gaps
```

A competency profile contains weighted requirements with a required level from 0 to 100. Staff profile assignments are effective-dated. Assessments are append-only historical records; current gap is calculated from the active profile and latest assessment per competency instead of overwriting assessment history.

Gap semantics:

```text
required level - latest assessed level = competency gap
```

If no assessment exists, the required level remains fully uncovered rather than inventing a score.

## 5. Architecture invariants

- Tenant/company/branch isolation remains mandatory.
- `Staff`/employee and authenticated `User` remain separate concepts.
- Authorization Role and Competency Profile remain separate concepts.
- Quality-driven training decisions must preserve the source rule and rationale.
- No disciplinary/legal HR decision may be automated from one Quality signal.
- Training assignments generated from Quality use thresholds and cooldown controls.
- Competency assessment history is time-aware and not silently rewritten.
- Future AI recommendations may sit above these explainable signals but must not replace rule/audit foundations.

## 6. Next increments

Recommended sequence:

```text
Training assignment lifecycle hardening
        ↓
Theory/exam + practical assessment models
        ↓
Training completion/certificate foundation
        ↓
Competency-gap → Training assignment rules
        ↓
Training effectiveness measurement against later Quality signals
        ↓
Branch Quality Score: TRAINING_COMPLIANCE real metric source
        ↓
Quality / Training / Competency UI
```

Before UI expansion, dedicated Training RBAC and assignment lifecycle transitions should be hardened.
