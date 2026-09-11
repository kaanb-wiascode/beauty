# Quality Operations Runbook

Last updated: 2026-09-12

This document records the operational execution rules for Branch Inspections, Findings and CAPA on `feature/core-commerce-foundation`.

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

## Overdue processing

Findings and CAPA plans with a due date in the past are surfaced through:

`GET /quality/overdue`

Operational processing uses:

`POST /quality/overdue/process`

The processor uses tenant/company/branch scope and `FOR UPDATE SKIP LOCKED` so multiple workers can safely operate without processing the same row twice. Findings receive an `overdue_at` timestamp. CAPA plans receive `overdue_at` and an immutable `OVERDUE` audit event.

## Domain boundaries

Inspection categories such as service quality, hygiene, camera audit, employee experience, document compliance and product verification remain templates/categories over the same Inspection → Finding → Quality Case → CAPA governance chain. They do not create parallel complaint systems.

Education & Development / LMS remains a separate bounded context and will integrate with Quality through rule-based assignments and effectiveness measurements.

## Next operational increments

1. inspection cancellation/reschedule lifecycle
2. controlled evidence attachments
3. CAPA ineffective/rework lifecycle hardening
4. configurable severity/SLA policy
5. versioned Branch Quality Score calculation
6. Quality UI for inspections, findings and CAPA
7. LMS + Competency foundation
