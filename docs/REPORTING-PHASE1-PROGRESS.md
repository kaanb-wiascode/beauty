# Reporting Phase 1 Progress

Canonical roadmap: `docs/REPORTING-DEVELOPMENT-ROADMAP.md`

Branch: `feature/core-commerce-foundation`

This file records incremental implementation progress without replacing the canonical roadmap.

## Completed foundation items

- Server-owned report keys and `ReportDefinition` metadata.
- Permission-aware `GET /reports/catalog`.
- Shared strict date-range DTO with ordered range validation.
- Reusable frontend `ReportFilterBar` and date presets.
- Shared frontend column/sort state.
- Layered permissions: `reports.read` plus source-domain read permission.
- Controlled `POST /reports/preview` contract.
- Client cannot provide arbitrary SQL, Prisma selections, tenant/company/branch overrides, or unregistered report keys.
- Server-owned column allow-lists and sort allow-lists.
- Bounded preview pagination (`limit <= 100`).
- Server-side sorting and pagination for Staff and Service preview reports.
- Server-side aggregate KPI summary independent of pagination.
- Staff Performance migrated to the shared preview contract.
- Service Performance migrated to the shared preview contract.
- Payment Summary migrated to the shared preview contract.
- Existing direct Staff/Service/Payment report endpoints preserved for incremental compatibility.
- Permission-aware catalog tests.
- Preview authorization, projection, sorting, pagination and aggregate tests.
- Empty dataset behavior tests.
- Timezone-offset and date-boundary DTO tests.
- Scope-override rejection tests.
- Staff report tenant/company/branch scope regression tests for BRANCH and CENTRAL-no-branch contexts.

## Phase 1 items still worth tightening before Phase 2

- Add equivalent scope regression coverage for Service and Payment report handlers.
- Add payment-specific financial integrity tests for refunded/completed boundary behavior through the reporting preview layer.
- Add explicit service empty-dataset regression coverage if handler behavior diverges in the future.
- Add end-to-end HTTP authorization tests for `/reports/catalog` and `/reports/preview` when the test harness can exercise authenticated tenant context cheaply.
- Confirm final monorepo quality run is green after concurrent branch activity settles.

## Phase 2 entry criteria

Begin the Export Engine only after the remaining Phase 1 tests above are either completed or intentionally deferred with a documented reason. Export must reuse the same report definitions, filters, permissions, scope rules and authorized columns as interactive preview.
