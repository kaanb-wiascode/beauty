# VALOO — Quality Management & Learning Roadmap

Last updated: 2026-09-12

This document is the execution roadmap for Quality Management, Branch Inspections and the future Learning/Competency bounded context. It supplements `docs/state/CURRENT-STATE.md` and `docs/roadmap/VALOO-IMPLEMENTATION-STATUS.md` and must remain aligned with the active development branch.

## 1. Verified baseline

Active branch: `feature/core-commerce-foundation`

Verified Quality Cockpit baseline before the Branch Inspection increment:

- commit `91248d9520eb712f240facddcdc036168ab2148b`
- `feat(quality): add management cockpit`
- Monorepo quality #739 — SUCCESS

Already present before Branch Inspections:

- customer feedback persistence/API
- Quality Case lifecycle and audit events
- quality permissions
- assignee-scope validation
- SLA breach processing
- feedback-request foundation
- notification outbox/dispatcher foundation
- customer-facing public feedback foundation
- Quality Management cockpit

## 2. Branch Inspection foundation

Current foundation scope:

- versioned inspection templates
- checklist items with required/optional behavior and weighting
- periodic branch schedules
- idempotent inspection planning
- `PLANNED → IN_PROGRESS → COMPLETED` execution lifecycle
- per-item results
- findings linked to inspection/results
- concurrency-safe Finding → Quality Case conversion
- branch quality score persistence foundation
- tenant/company/branch isolation
- `quality.read` / `quality.manage` RBAC
- assignee/inspector membership-scope validation
- row locking for execution transitions

The foundation is intentionally generic enough for:

- periodic service-quality inspections
- cleaning/hygiene inspections
- camera/control-room reviews
- employee-experience checks
- document/compliance checks
- product usage/verification audits

## 3. Quality Management target architecture

Quality Management should evolve as a single governance chain:

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
Verification / Closure
        ↓
Branch Quality Score
```

Planned extensions:

1. Finding deduplication and recurring-finding detection.
2. CAPA entities with owner, due date, verification and effectiveness review.
3. configurable severity/SLA policy by category.
4. inspection schedule worker with lease/idempotency semantics.
5. automatic Branch Quality Score calculation from inspections, findings, feedback and CAPA effectiveness.
6. recurring root-cause analytics.
7. branch/region comparison views.
8. evidence attachments through controlled object storage.
9. policy-driven Quality ↔ Training automation.

## 4. Branch Quality Score

The score must never be a hardcoded vanity metric. The calculation policy should be versioned and explainable.

Candidate inputs:

- inspection score
- critical/high finding penalties
- repeat-finding penalties
- SLA breach penalties
- CAPA completion/effectiveness
- verified customer feedback indicators
- compliance/documentation results

Every published score should preserve the calculation period, policy version and auditable source metrics.

## 5. Education & Development / LMS bounded context

Education & Development must be implemented as a separate main module, integrated with HR and Quality rather than embedded inside either domain.

Planned capabilities:

- training catalog
- training programs
- employee/role/branch assignments
- service trainings
- sales trainings
- customer-satisfaction trainings
- corporate standards trainings
- management/leadership trainings
- exams and question banks
- practical assessments
- certificates and expiry
- recurring competency reviews
- theoretical score
- practical score
- competency matrix
- employee/role/branch gap analysis
- HR employee integration
- Quality Case / Finding driven training assignment

## 6. Competency Management

Target model:

```text
Competency
  ↕
Role / Position Requirement
  ↕
Employee Competency Profile
  ↕
Assessment / Exam / Practical Evaluation
  ↕
Gap
  ↕
Training Assignment
```

Competency records must be time-aware and auditable. Historical competency results must not be silently overwritten when requirements or assessment methods change.

## 7. Quality ↔ Training rule automation

Examples of future configurable rules:

- repeated hygiene finding → mandatory hygiene refresher
- repeated service-protocol failure → practical service reassessment
- sales complaint category threshold → sales/customer-communication training
- expired certificate → employee eligibility warning
- CAPA requiring behavioral change → assigned learning path + effectiveness recheck

Rules must be configurable, versioned and explainable. No hardcoded employee penalty or disciplinary decision should be derived automatically from a single quality signal.

## 8. Execution order

### Q1 — Branch Inspection foundation
- template/checklist persistence
- schedule persistence
- plan/start/result/complete APIs
- Finding → Quality Case conversion
- focused tests and CI

### Q2 — Operational hardening
- scheduler worker
- inspection cancellation/reschedule
- evidence attachments
- finding ownership/due dates
- inspection/case UI

### Q3 — CAPA
- CAPA lifecycle
- verification/effectiveness review
- recurring root-cause analytics

### Q4 — Branch Quality Score
- versioned scoring policy
- automated calculation job
- branch/region cockpit

### L1 — LMS foundation
- catalog/program/course/assignment
- exam and practical assessment
- certificate lifecycle

### L2 — Competency Management
- competency definitions
- role requirements
- employee matrix
- periodic assessment

### L3 — Quality ↔ Training automation
- rule engine integration
- automated assignments
- effectiveness feedback loop

## 9. Architecture invariants

- Tenant/company/branch boundaries remain mandatory.
- RBAC and scope checks apply independently from workflow rules.
- Finding, Quality Case and CAPA remain auditable.
- Training/competency data is not a replacement for HR identity.
- Historical assessment and score snapshots remain immutable/auditable.
- Automation may recommend/assign workflows but must not silently invent compliance facts.
- `main` remains untouched until an explicit release/merge decision.
