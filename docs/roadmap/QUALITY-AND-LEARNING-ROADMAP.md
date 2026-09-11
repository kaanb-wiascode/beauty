# VALOO — Quality Management & Learning Roadmap

Last updated: 2026-09-12

This document is the execution roadmap for Quality Management, Branch Inspections and the future Learning/Competency bounded context. It supplements `docs/state/CURRENT-STATE.md` and `docs/roadmap/VALOO-IMPLEMENTATION-STATUS.md` and must remain aligned with the active development branch.

## 1. Verified baseline

Active branch: `feature/core-commerce-foundation`

Latest verified Quality backend baseline:

- `19325c64218b014f30e37acb32311a25b557a44f`
- `feat(quality): add inspection cancel and reschedule lifecycle`
- Monorepo quality #748 — SUCCESS

Immediately preceding verified increments:

- `ef361283ca0b3c4a3baf69eb25008cd86010c3ef` — Branch Quality Score Engine — CI #747 SUCCESS
- `cab8436295ff1b0324f683c06e15e00b22fdfd6e` — Evidence attachment foundation — CI #746 SUCCESS
- `286d309b106492c1046c7f5293c6624f4caa5a9c` — CAPA rework lifecycle — CI #745 SUCCESS
- `357e36a83784068a3994b323cd9365141d46bbd5` — inspection scheduler and overdue processing; follow-up test typing fix verified by CI #744 SUCCESS

Already present in the Quality bounded context:

- customer feedback persistence/API
- Quality Case lifecycle and audit events
- quality permissions and assignee-scope validation
- SLA breach processing
- feedback-request foundation
- notification outbox/dispatcher foundation
- customer-facing public feedback foundation
- Quality Management cockpit
- Branch Inspection templates/checklists/schedules/execution
- Findings and Finding → Quality Case conversion
- CAPA lifecycle, verification/effectiveness and rework
- scheduler/overdue processing
- controlled evidence metadata
- versioned Branch Quality Score policies and calculation runs
- planned-inspection cancellation/reschedule audit lifecycle

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

Next CAPA extensions:

- recurring root-cause analytics
- policy-based CAPA escalation
- branch/region trend views
- operational UI for action ownership, verification and evidence

## 5. Branch Quality Score

The score is now backed by a versioned and explainable policy engine rather than a hardcoded vanity metric.

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

Education & Development remains a separate main module, integrated with HR and Quality rather than embedded inside either domain.

Planned capabilities:

- training catalog/program/course/assignment
- service, sales, customer-experience, corporate and management trainings
- exams and question banks
- practical assessments
- certificates and expiry
- recurring competency reviews
- theoretical/practical scores
- competency matrix
- employee/role/branch gap analysis
- HR employee integration
- Quality Finding/Case/CAPA driven training assignment

## 8. Competency Management

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

## 9. Quality ↔ Training rule automation

Examples of future configurable rules:

- repeated hygiene finding → mandatory hygiene refresher
- repeated service-protocol failure → practical service reassessment
- complaint-category threshold → customer-communication training
- expired certificate → employee eligibility warning
- CAPA requiring behavioral change → assigned learning path + effectiveness recheck

Rules must be configurable, versioned and explainable. No hardcoded employee penalty or disciplinary decision should be derived automatically from a single quality signal.

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

Remaining: root-cause analytics, policy escalation and operational UI.

### Q4 — Branch Quality Score — BACKEND ENGINE COMPLETE
- versioned scoring policy
- immutable calculation runs
- dimension snapshots
- inspection/customer-feedback metric sources

Remaining: scheduled calculation, additional metric sources and branch/region cockpit.

### Q5 — Quality policy/catalog hardening — NEXT
- configurable severity/SLA policy
- standard versioned inspection template catalog
- recurring finding/root-cause analytics
- Quality operational UI completion

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

## 11. Architecture invariants

- Tenant/company/branch boundaries remain mandatory.
- RBAC and scope checks apply independently from workflow rules.
- Finding, Quality Case, CAPA, inspection lifecycle and score calculations remain auditable.
- Training/competency data is not a replacement for HR identity.
- Historical assessment and score snapshots remain immutable/auditable.
- Automation may recommend/assign workflows but must not silently invent compliance facts.
- `main` remains untouched until an explicit release/merge decision.
