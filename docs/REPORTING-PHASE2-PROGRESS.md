# Reporting Phase 2 Progress

Canonical roadmap: `docs/REPORTING-DEVELOPMENT-ROADMAP.md`

Branch: `feature/core-commerce-foundation`

This file records incremental Phase 2 implementation progress without replacing the canonical roadmap.

## Completed export foundation items

- Server-owned export capabilities on each `ReportDefinition`.
- Explicit `exportableColumns` separate from preview-visible columns.
- Explicit export format allow-list (`PDF`, `XLSX`, `CSV`).
- Strict export request DTO with no arbitrary SQL, Prisma, storage, tenant, company or branch controls.
- Export preparation reuses the same report/domain permission checks as preview.
- Internal scope columns such as `branchId` cannot be re-enabled through export parameters.
- Persistent `report_export_jobs` migration with scope snapshot, requester, format, filters, columns, sort, lifecycle timestamps, row count, storage reference and bounded failure metadata.
- Export job lifecycle states: `QUEUED`, `PROCESSING`, `READY`, `FAILED`, `EXPIRED`.
- Scoped export history API:
  - `POST /reports/exports`
  - `GET /reports/exports`
  - `GET /reports/exports/:id`
- Export history reads are constrained by authenticated tenant/company/branch context.
- Atomic worker claiming using `FOR UPDATE SKIP LOCKED` to prevent duplicate processing.
- Guarded `PROCESSING -> READY` and `PROCESSING -> FAILED` transitions.
- UTF-8 BOM CSV generator with RFC-style quoting for commas, quotes and line breaks.
- Spreadsheet formula-injection neutralization for exported string cells.
- CSV tests cover Turkish characters, quoting, multiline values, structured values and formula-injection safety.
- Reporting E2E covers export job creation, scoped history retrieval, get-by-id, unauthenticated rejection and arbitrary export-field rejection.

## Intentional implementation note

`report_export_jobs` is currently created by an explicit migration and accessed through server-owned, parameterized Prisma SQL fragments. Client input is never interpolated as SQL identifiers, table names, expressions or raw query fragments.

The generated Prisma schema model is intentionally not being force-written while concurrent Finance/HR development is modifying the database area on the same shared branch. A schema synchronization pass should add the corresponding Prisma model once concurrent database edits settle. Until then, do not generate future migrations that attempt to recreate or drop `report_export_jobs` based on schema drift.

## Next Phase 2 increments

1. Add export storage abstraction with generated object keys controlled only by the server.
2. Build a request-scope-independent reporting data adapter for background workers. Existing Staff/Service/Payment services depend on request-scoped `TenantContext`, so workers must not invoke them without a trusted scope reconstruction strategy.
3. Connect the CSV generator to the export worker lifecycle.
4. Persist `rowCount`, storage reference, completion timestamp and retention/expiry on successful generation.
5. Add download authorization that revalidates current access before exposing an artifact.
6. Add expiry cleanup and retention policy.
7. Add XLSX workbook generation.
8. Add server-side PDF report generation.
9. Add export audit events and user-facing history/download UX.

## Security invariants

- Export permissions can never be broader than preview/source-domain permissions.
- Tenant/company/branch scope comes from authenticated context or a trusted job snapshot, never request parameters.
- Storage keys are server-generated and are not accepted from clients.
- Unauthorized/internal columns are rejected before a job is queued.
- Background processing must preserve the scope snapshot and must not default to tenant-wide access.
- Failed jobs expose bounded business-safe failure summaries, not stack traces or secrets.
