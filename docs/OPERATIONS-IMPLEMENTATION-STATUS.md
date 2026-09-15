# Operations Implementation Status

Source roadmap: `docs/OPERATIONS-DEVELOPMENT-ROADMAP.md`

Last synchronized: 2026-09-15

This document tracks implementation progress conservatively. A phase is not considered complete while acceptance criteria, integration or CI/E2E validation remains outstanding.

## Overall estimate

Current implementation estimate: **~96%** of the Operations roadmap.

The remaining work is concentrated in richer multi-staff UI, broader operational tasks, precise permissions, walk-in depth, strict transaction-bound configuration revalidation and full branch-wide CI/E2E verification.

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
- HR published-shift, approved-leave, certification and competency eligibility reused through `SkillBasedSchedulingService`.
- Branch-configurable Operations eligibility policy with OFF/WARN/BLOCK modes.
- ServiceExecution start revalidates staff eligibility before physical execution begins.
- Explicit branch working-hours source with weekday/open/closed/cross-midnight/time-zone rules.

Still open:

- Multi-resource quantity requirements.

## Phase 3 — Service Execution

Status: **near complete**

Implemented:

- Separate ServiceExecution domain.
- Explicit start/complete actions and append-only execution events.
- Resource revalidation at execution start.
- Staff published-shift/leave/certification/competency eligibility revalidation at execution start.
- Required SOP/checklist snapshot and completion guard.
- Expected/actual consumable snapshot/edit flow.
- Inventory posting observed through existing Inventory ownership.
- Explicit Appointment completion handoff.
- Explicit package Session consumption handoff.
- Dedicated Service Execution workspace.
- Multi-staff execution assignments with PRIMARY / ASSISTANT / HANDOFF roles.
- Automatic PRIMARY assignment seeding for every execution.
- Serializable staff handoff with optimistic assignment versioning and append-only execution events.
- Handoff target eligibility validation against Operations OFF/WARN/BLOCK policy.
- Controlled IN_PROGRESS cancellation with reason snapshot, optimistic versioning and immutable correction audit.
- Controlled COMPLETED reversal to CANCELLED only before Appointment completion and before Inventory consumption posting.
- Correction actions close active staff assignments and preserve the prior execution as auditable history before a restart.

Still open:

- Walk-in ServiceExecution completion model.
- Deeper Training/Quality reference integration for SOP templates.
- Richer multi-staff frontend controls beyond the API foundation.
- Wire the new execution correction action component into the main Service Execution panel.

## Phase 4 — Capacity, Waitlist & Recovery

Status: **near complete**

Implemented:

- Resource Capacity Engine and utilization metrics.
- Staff availability board derived from HR shifts/leave/attendance plus Appointment/Execution state.
- Waitlist lifecycle and audit/versioning.
- Resource-aware slot matching.
- Approved-leave-aware matching and acceptance.
- Staff eligibility guard at waitlist booking acceptance, including shift/certification/competency policy.
- Waitlist suggestions pre-filtered by branch working hours and full HR eligibility policy before `MATCH_FOUND`.
- Branch working-hours revalidation during waitlist booking acceptance.
- Serializable slot acceptance with Appointment + allocation + waitlist transition in one transaction.
- Cancellation slot recovery and priority ranking.
- Resource bottleneck analysis.
- Shift/leave-aware workforce capacity integrated from HR `WorkforceCapacityService` into Operations optimization.

Still open:

- Automated offer/expiry delivery on top of CRM Communications.
- Move branch-hours/eligibility acceptance revalidation fully inside the serializable booking transaction for strict configuration-race protection.

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

Status: **advanced foundation substantially implemented**

Implemented:

- Explainable no-show risk scoring.
- Explainable delay risk scoring.
- Manager insights.
- Capacity recommendations from authoritative Capacity Engine bottlenecks.
- Staff load-balance recommendations from Utilization read-model.
- HR published-shift/approved-leave workforce capacity shortages included in optimization recommendations and anomalies.
- Demand-aware slot candidates based on 8-week historical demand versus upcoming bookings.
- Anomaly detection for no-show rate spikes, critical resource capacity saturation and workforce shift-capacity saturation.
- Dedicated Intelligence and Optimization workspaces.
- Deterministic scheduling remains authoritative; no automatic booking/reassignment is performed by intelligence.

Still open:

- Stronger forecasting with seasonality/holiday/branch-hours context.
- Recommendation outcome tracking and model-quality telemetry.
- Optional ML layer only after sufficient production-quality data exists.

## Current CI State

Operations changes are continuously landing on the shared `feature/core-commerce-foundation` branch alongside HR, Reports, Admin, Finance and other workstreams.

Recent Operations quality runs have frequently been superseded/cancelled by parallel pushes. The current branch quality run must pass migration deployment, API typecheck/tests/E2E, API build and web lint/typecheck/build before Operations can be called branch-wide green.

Do **not** interpret a pending, in-progress or superseded run as a successful validation.

## Remaining highest-priority work

1. Verify a current branch HEAD through the complete quality workflow.
2. Wire correction and richer multi-staff controls into the Service Execution workspace.
3. Complete walk-in ServiceExecution/commercial linkage.
4. Expand lightweight Operational Tasks beyond opening/closing.
5. Move waitlist branch-hours/eligibility revalidation into the serializable acceptance transaction.
6. Complete roadmap E2E scenarios and permission refinement.
