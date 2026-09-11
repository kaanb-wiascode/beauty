# Quality Operations Runbook

Last updated: 2026-09-12

This document records the operational execution rules for Branch Inspections, Findings, CAPA, Evidence and Branch Quality Score on `feature/core-commerce-foundation`.

## Inspection schedule processing

Supported cadence values:

- DAILY
- WEEKLY
- MONTHLY
- QUARTERLY

Due schedules are processed with tenant/company/branch scope, `FOR UPDATE SKIP LOCKED`, a short worker lease and a deterministic idempotency key per schedule occurrence. The worker advances `next_due_at` only after the occurrence is safely planned in the same serializable transaction.

API:

`POST /quality/inspections/schedules/process-due`

The endpoint is protected by `quality.manage`. It is the worker-ready execution surface and can later be invoked by the platform scheduler without changing the domain transaction semantics.

## Inspection cancellation and reschedule

Only `PLANNED` inspections can be cancelled or rescheduled. In-progress inspections are not silently discarded.

APIs:

- `POST /quality/inspections/:id/cancel`
- `POST /quality/inspections/:id/reschedule`

Cancellation requires a reason and preserves the original inspection as `CANCELLED` with audit metadata. Reschedule creates a new `PLANNED` inspection, links old/new records using `rescheduled_from_inspection_id` / `rescheduled_to_inspection_id`, and records an immutable `quality_inspection_events` event. Repeated reschedule requests return the already-linked replacement rather than producing a second replacement.

## Evidence

Controlled evidence metadata can be linked to exactly one Quality subject:

- Inspection
- Inspection Result
- Finding
- Quality Case
- CAPA

APIs:

- `POST /quality/evidence`
- `GET /quality/evidence`

Evidence stores metadata and an opaque storage object key, not raw file bytes or a public URL. Supported metadata includes evidence kind, original filename, MIME type, byte size, SHA-256, note, captured time and uploader. The object-storage provider remains a separate infrastructure concern.

## Overdue processing

Findings and CAPA plans with a due date in the past are surfaced through:

`GET /quality/overdue`

Operational processing uses:

`POST /quality/overdue/process`

The processor uses tenant/company/branch scope and `FOR UPDATE SKIP LOCKED` so multiple workers can safely operate without processing the same row twice. Findings receive an `overdue_at` timestamp. CAPA plans receive `overdue_at` and an immutable `OVERDUE` audit event.

## CAPA rework

CAPA effectiveness failure is not a terminal dead-end. Supported lifecycle includes:

`OPEN → IN_PROGRESS → VERIFICATION → EFFECTIVE → CLOSED`

and the rework path:

`VERIFICATION → INEFFECTIVE → IN_PROGRESS → VERIFICATION`

Returning an ineffective CAPA to `IN_PROGRESS` clears the prior verification decision/result and writes a status-change audit event so a fresh corrective cycle can be executed and re-verified.

## Branch Quality Score

Branch Quality Score is policy-driven, versioned and explainable. It is not a fixed vanity formula.

APIs:

- `POST /quality/scores/policies`
- `GET /quality/scores/policies`
- `POST /quality/scores/calculate`
- `GET /quality/scores`

A policy defines versioned dimensions, weights, missing-data behavior and severity penalty rules. Supported operational source implementations currently include:

- `INSPECTION_CATEGORY`
- `CUSTOMER_FEEDBACK`

Forward-compatible source kinds are reserved for `TRAINING_COMPLIANCE` and `CUSTOM_METRIC`; until an implementation supplies those metrics they are persisted as unsupported/no-data rather than silently inventing a score.

Missing data policy is explicit:

- `EXCLUDE_AND_REWEIGHT`: dimensions without data are excluded and available dimensions are reweighted.
- `ZERO_FILL`: missing/unsupported dimensions participate as zero.

Every calculation writes an immutable `branch_quality_score_runs` record plus per-dimension snapshots in `branch_quality_score_dimension_runs`. The existing `branch_quality_scores` table remains the latest period summary and points to the latest calculation run. This preserves both fast cockpit reads and auditable historical calculations.

Finding penalties are policy-configured by severity and capped by `max_penalty_points`. The final score is clamped to 0–100.

## Domain boundaries

Inspection categories such as service quality, hygiene, camera audit, employee experience, document compliance and product verification remain templates/categories over the same Inspection → Finding → Quality Case → CAPA governance chain. They do not create parallel complaint systems.

Education & Development / LMS remains a separate bounded context and will integrate with Quality through rule-based assignments and effectiveness measurements.

## Next operational increments

1. configurable severity/SLA policy
2. versioned inspection template catalog and standard branch audit packs
3. recurring finding/root-cause analytics
4. branch/region comparison cockpit
5. Quality UI for inspections, findings, evidence, CAPA and score explanations
6. LMS + Competency foundation
7. Quality ↔ Training rule automation
