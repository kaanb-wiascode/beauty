# Operations Implementation Status

Source roadmap: `docs/OPERATIONS-DEVELOPMENT-ROADMAP.md`

Last synchronized: 2026-09-15

This document tracks implementation progress without changing ownership boundaries defined by the Operations roadmap. It is intentionally conservative: a phase is not marked complete while roadmap capabilities remain outstanding.

## Phase 1 — Daily Operations & Visit Lifecycle

Status: **implemented foundation / partially complete**

Implemented:

- Visit aggregate and lifecycle foundation.
- Appointment-backed and walk-in Visit creation foundations.
- Tenant/company/branch isolation.
- Optimistic versioning and append-only Visit events.
- Live operations board and Visit timeline.
- Checkout readiness read model.
- Checkout blockers for payment/package-session/commercial context.
- Backend checkout guard; UI-only validation is not trusted.

Still open:

- Full walk-in commercial/service execution linkage.
- Advanced no-show workflow and recovery automation.
- Rebooking workflow and metrics.
- Formal idempotency-key support on every Visit mutation endpoint.

## Phase 2 — Resource Engine

Status: **implemented foundation / partially complete**

Implemented:

- Branch-scoped room/cabin master data.
- Room operational states.
- Device/equipment ownership reused from Inventory `inventory_assets`; no duplicate device catalog.
- Service operational requirements attached to the existing Service catalog.
- Room type requirement.
- Specific Inventory asset or asset-type requirement.
- Preparation and cleanup buffers.
- Appointment resource allocations.
- Serializable/advisory-lock protected allocation flow.
- Explainable room/asset time conflicts.
- Inventory maintenance blocking.
- Resource allocation release with optimistic versioning.
- Scope-isolation and conflict tests.
- `/operations/resources` management UI.
- Resource requirement revalidation again at ServiceExecution start, including room type, asset type/specific asset, room state and current maintenance state.

Still open:

- Staff shift/leave-aware availability.
- Competency/certification policy integration.
- Branch working-hours integration.
- Full resource calendar/timeline UX.
- Explicit resource block/unavailability management beyond room status and Inventory maintenance.
- Multi-resource quantity requirements.

## Phase 3 — Service Execution

Status: **implemented foundation / partially complete**

Implemented:

- Separate `ServiceExecution` domain; existing package `Session` is not reused incorrectly as physical execution.
- Appointment-backed execution start and complete actions.
- Visit/Appointment/Service/Staff/resource linkage.
- Serializable execution mutation flow with advisory locking.
- Optimistic versioning on completion.
- Append-only execution event history.
- ServiceExecution start requires Visit `IN_SERVICE`.
- Configured room/equipment requirements are enforced at start.
- Appointment-backed Visit cannot transition to `SERVICE_COMPLETED` until every linked appointment has a completed ServiceExecution (database integrity guard).
- Dedicated `/operations/service-executions` workspace.
- Operations local navigation between live operations, resources/capacity and service executions.

Still open:

- Walk-in ServiceExecution model/linkage.
- Multiple staff/handoffs.
- Service SOP/checklist evidence.
- Expected vs actual consumable recording.
- Inventory consumption posting from completed execution context.
- Explicit Appointment-completion handoff.
- Package Session consumption handoff. Package Session remains a separate business action and must not be silently auto-consumed.
- Controlled execution cancellation/reversal semantics.

## Phase 4 — Capacity & Advanced Operations

Status: **capacity foundation implemented / broader phase open**

Implemented:

- Explicit-window Capacity Engine read model.
- Room and Inventory asset resource-minute capacity.
- Allocation overlap clipping to requested window.
- Unavailable resources excluded from effective capacity.
- Category-level utilization and remaining capacity.
- Bottleneck detection for unavailable/high/critical utilization.
- `/operations/resources/capacity` API.
- Capacity analysis UI with custom time window and bottleneck cards.
- Capacity calculation tests.

Still open:

- Working-hours-aware daily capacity.
- Staff capacity and leave/shift integration.
- Competency-aware capacity.
- Waitlist promotion engine.
- Cancellation recovery/backfill.
- Slot recommendation engine.
- Historical capacity analytics and forecasting.

## Current CI State

Latest verified Operations-containing quality run reached and passed:

- dependency installation
- Prisma schema validation
- full migration deployment, including Operations resource and ServiceExecution foundations
- Prisma client generation
- database package typecheck/build
- shared contract typecheck/build

API typecheck then failed on pre-existing/parallel CRM, Finance, Profitability, Reports and Training errors; no Operations TypeScript error was reported in that run. Web stages were skipped because the workflow stops after API typecheck failure.

A later Operations completion-integrity migration and resource-requirement hardening commits have triggered newer quality runs; those runs must be rechecked before declaring branch-wide CI green.

## Next Operations Priorities

1. Verify latest migration/API/web CI on the current branch HEAD.
2. Add resource calendar and explicit unavailability/block management.
3. Add Appointment completion handoff after successful ServiceExecution completion.
4. Add explicit package Session consumption handoff while preserving Sessions as source of truth.
5. Add consumable execution records and Inventory posting integration.
6. Integrate staff shifts, leave and Training competency/certification into conflict/capacity decisions.
