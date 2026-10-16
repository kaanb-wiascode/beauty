# Reporting Phase 1 Progress

Canonical roadmap: `docs/REPORTING-DEVELOPMENT-ROADMAP.md`

Branch: `feature/core-commerce-foundation`

This file records incremental implementation progress without replacing the canonical roadmap.

## Phase 1 status

**Code complete; final monorepo quality verification pending.**

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
- Service report tenant/company/branch scope regression tests for BRANCH and CENTRAL-no-branch contexts.
- Payment report scope regression tests for branch and central company-wide contexts.
- Payment reporting integrity tests keeping completed collections, refunds and net values separate.
- Authenticated HTTP/E2E coverage for `/reports/catalog` and `/reports/preview`.
- HTTP boundary rejects unauthenticated requests and arbitrary preview scope/query fields.

## Phase 1 completion gate

The implementation satisfies the current Reporting Foundation Definition of Done in code and automated-test coverage. The remaining gate is operational rather than architectural:

- confirm a complete `Monorepo quality` run passes after concurrent branch activity settles;
- fix any reporting-related failure found by that run before beginning Phase 2.

## Phase 2 entry criteria

Begin the Export Engine only after the final quality run is green. Export must reuse the same report definitions, filters, permissions, scope rules and authorized columns as interactive preview. PDF/XLSX/CSV generation must not introduce a second authorization or business-logic path.
