# Operations Implementation Status

Source roadmap: `docs/OPERATIONS-DEVELOPMENT-ROADMAP.md`

Last synchronized: 2026-09-15

This document tracks implementation progress conservatively. A phase is not considered complete while acceptance criteria, integration or CI/E2E validation remains outstanding.

## Overall estimate

Current implementation estimate: **~90%** of the Operations roadmap.

The remaining work is concentrated in deep integrations, permission refinement, controlled reversals, advanced multi-staff execution and full branch-wide CI/E2E verification.

## Phase 1 — Visit & Operational Lifecycle

Status: **near complete**

Implemented:

- Visit aggregate and lifecycle, Appointment-backed and walk-in check-in foundations.
- Tenant/company/branch isolation, optimistic versioning and append-only Visit events.
- Live Operations board and operational timeline.
- Checkout pending/checked-out semantics.
- Checkout readiness and authoritative blockers for payment/package/commercial context.
- Backend checkout guard.
- Long-wait/checkout exception signals.

Still open:

- Full walk-in commercial/service-execution linkage.
- Formal idempotency-key coverage on every Visit mutation.
- Full lifecycle E2E suite on the current branch HEAD.

## Phase 2 — Resource Engine

Status: **near complete**

Implemented:

- Branch rooms/cabins and operational states.
- Inventory assets reused as device/equipment source of truth.
- Service resource requirements, room type, asset type/specific asset.
- Preparation/cleanup buffers.
- Serializable/advisory-lock protected resource allocations.
- Maintenance checks and explicit resource blocks.
- Incident-aware resource blocking and cancellation/no-show allocation release.
- Resource Calendar UI/API.
- Capacity engine and explainable bottlenecks.
- Approved leave hard-block in slot acceptance/matching.

Still open:

- HR shift/working-hours authoritative scheduling integration.
- Training competency/certification WARN/BLOCK policy.
- Multi-resource quantity requirements.

## Phase 3 — Service Execution

Status: **near complete**

Implemented:

- Separate ServiceExecution domain.
- Explicit start/complete actions and append-only execution events.
- Resource revalidation at execution start.
- Required SOP/checklist snapshot and completion guard.
- Expected/actual consumable snapshot/edit flow.
- Inventory posting observed through existing Inventory ownership.
- Explicit Appointment completion handoff.
- Explicit package Session consumption handoff.
- Dedicated Service Execution workspace.

Still open:

- Walk-in ServiceExecution completion model.
- Multiple staff/handoffs and responsibility timeline.
- Controlled execution cancellation/reversal semantics.
- Deeper Training/Quality reference integration for SOP templates.

## Phase 4 — Capacity, Waitlist & Recovery

Status: **near complete**

Implemented:

- Resource Capacity Engine and utilization metrics.
- Staff availability board derived from HR/Appointment/Execution data.
- Waitlist lifecycle and audit/versioning.
- Resource-aware slot matching.
- Approved-leave-aware matching and acceptance.
- Serializable slot acceptance with Appointment + allocation + waitlist transition in one transaction.
- Cancellation slot recovery and priority ranking.
- Resource bottleneck analysis.

Still open:

- Shift-aware denominator and branch working-hours integration.
- Competency-aware slot matching/capacity.
- Automated offer/expiry delivery on top of CRM Communications.

## Phase 5 — Branch Operations

Status: **substantially complete**

Implemented:

- Centrally versioned opening/closing checklist templates.
- Branch daily checklist executions and required-item completion guard.
- Operational incidents with resource outage/block linkage.
- Affected appointment detection.
- Live Alerts / Exception Management.
- Exceptions for waiting, delay, checkout, room/device outage, resource impact, incidents and upcoming stock shortage.

Still open:

- Broader lightweight operational task catalog beyond opening/closing.
- Incident assignment/escalation SLA depth.
- Quality case creation/link workflow from safety/quality incidents.

## Phase 6 — Rebooking & Customer Journey Optimization

Status: **near complete**

Implemented:

- Configurable cancellation/no-show reason taxonomy with historical snapshots.
- Explicit cancellation/no-show workflow.
- Customer reliability analytics: no-show, late cancellation, attendance and confirmation rates.
- Service-level recommended rebooking interval.
- Concurrency-safe source→target rebooking linkage.
- Rebooking analytics.
- CRM-backed reminder delivery with consent/provider/idempotency ownership retained in CRM.
- Separate appointment confirmation state.
- Checkout follow-up messaging foundation.
- Unified Appointment operational timeline from real domain records.

Still open:

- Automated scheduled reminder orchestration for appointment-specific rules.
- Richer reschedule-request handoff into booking UI.
- Follow-up template/policy administration beyond current operational action.

## Phase 7 — Advanced Operations Intelligence

Status: **implemented foundation / advanced optimization active**

Implemented:

- Explainable no-show risk scoring.
- Explainable delay risk scoring.
- Manager insights.
- Capacity recommendations from authoritative Capacity Engine bottlenecks.
- Staff load-balance recommendations from Utilization read-model.
- Demand-aware slot candidates based on 8-week historical demand versus upcoming bookings.
- Anomaly detection for no-show rate spikes and critical capacity saturation.
- Dedicated Intelligence and Optimization workspaces.
- Deterministic scheduling remains authoritative; no automatic booking/reassignment is performed by intelligence.

Still open:

- Stronger forecasting with seasonality/holiday/branch-hours context.
- Competency/shift-aware optimization recommendations.
- Recommendation outcome tracking and model-quality telemetry.
- Optional ML layer only after sufficient production-quality data exists.

## Current CI State

Operations changes are continuously landing on the shared `feature/core-commerce-foundation` branch alongside HR, Reports, Admin, Finance and other workstreams.

Recent Operations quality runs have frequently been superseded/cancelled by parallel pushes. The latest branch quality run must pass migration deployment, API typecheck/tests/E2E, API build and web lint/typecheck/build before Operations can be called branch-wide green.

Do **not** interpret a pending or superseded run as a successful validation.

## Remaining highest-priority work

1. Verify a current branch HEAD through the complete quality workflow.
2. Add HR shift/branch-working-hours integration to conflict, utilization and capacity calculations.
3. Add Training competency/certification WARN/BLOCK policies to assignment and slot matching.
4. Add multiple-staff ServiceExecution handoffs.
5. Add controlled execution reversal/cancellation semantics.
6. Expand lightweight Operational Tasks beyond opening/closing.
7. Complete roadmap E2E scenarios and permission refinement.
