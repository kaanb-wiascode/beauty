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
- Export job authorization snapshot includes requester membership and role identifiers for later revalidation.
- Export job lifecycle states: `QUEUED`, `PROCESSING`, `READY`, `FAILED`, `EXPIRED`.
- Scoped export history API:
  - `POST /reports/exports`
  - `GET /reports/exports`
  - `GET /reports/exports/:id`
  - `GET /reports/exports/:id/download`
- Export history reads are constrained by authenticated tenant/company/branch context.
- Export artifact downloads are restricted to the original requester, require `READY` and non-expired state, and revalidate current report/source-domain permissions before storage access.
- Download responses use `private, no-store`; storage keys are never exposed as public artifact paths.
- Atomic worker claiming using `FOR UPDATE SKIP LOCKED` to prevent duplicate processing.
- Guarded `PROCESSING -> READY` and `PROCESSING -> FAILED` transitions.
- Worker revalidates current active membership, current role scope, branch access and all report/source-domain permissions before materializing data.
- Background export creates an isolated Nest request context and initializes request-scoped `TenantContext` from the revalidated trusted job snapshot.
- Export materialization reuses existing Staff/Service/Payment domain services instead of duplicating business calculations.
- Opt-in internal worker runner controlled by `REPORT_EXPORT_WORKER_ENABLED`; no public process endpoint is exposed.
- Worker polling and batch sizes are bounded and same-process overlapping iterations are blocked.
- Server-controlled filesystem storage abstraction with generated keys and storage-root containment checks.
- CSV processor pipeline: claim -> revalidate authorization -> revalidate stored payload -> materialize -> generate -> store -> mark READY/FAILED.
- Successful jobs persist row count, storage reference, completion state and configurable retention expiry (`REPORT_EXPORT_RETENTION_DAYS`, bounded 1-365; default 7).
- Expired READY jobs are atomically marked `EXPIRED` using `FOR UPDATE SKIP LOCKED` and their stored artifacts are deleted by the worker cleanup cycle.
- Expiry cleanup has bounded batch size and continues safely when a single storage deletion fails.
- UTF-8 BOM CSV generator with RFC-style quoting for commas, quotes and line breaks.
- Spreadsheet formula-injection neutralization for exported string cells.
- CSV tests cover Turkish characters, quoting, multiline values, structured values and formula-injection safety.
- Storage tests cover generated keys, read-back and path traversal containment.
- Worker tests cover successful CSV processing, revoked authorization, tampered stored payload, unimplemented formats, an empty queue, bounded batches and no-overlap behavior.
- Expiry tests cover bounded cleanup, storage deletion and partial storage failures.
- Download tests cover requester ownership, readiness, expiry and current permission revalidation.
- Reporting E2E covers export job creation, scoped history retrieval, get-by-id, unauthenticated rejection and arbitrary export-field rejection.

## Intentional implementation note

`report_export_jobs` is currently created by explicit migrations and accessed through server-owned, parameterized Prisma SQL fragments. Client input is never interpolated as SQL identifiers, table names, expressions or raw query fragments.

The generated Prisma schema model is intentionally not being force-written while concurrent Finance/HR/Platform development is modifying the database area on the same shared branch. A schema synchronization pass should add the corresponding Prisma model once concurrent database edits settle. Until then, do not generate future migrations that attempt to recreate or drop `report_export_jobs` based on schema drift.

The current filesystem storage provider is suitable as a development/default provider. A production object-storage provider should replace it before multi-instance production export delivery, while retaining the same server-generated-key and authorization rules.

## Current CI note

Recent monorepo quality runs validate the Prisma schema but stop during migration deployment in the unrelated Platform migration `20260915150000_platform_privileged_governance`, because that migration inserts into `platform_permissions` before that relation exists at that point in migration order. Reporting migrations are not reached in those failed runs. Do not classify Reporting CI as green until a later descendant run passes migration deployment and reaches API typecheck/tests/E2E/build.

## Next Phase 2 increments

1. Synchronize `ReportExportJob` into the active Prisma schema after concurrent database edits settle.
2. Add XLSX workbook generation with typed numeric/date cells, column widths and metadata sheets.
3. Add server-side PDF report generation.
4. Add export audit events.
5. Add user-facing export history, status and download UX.
6. Replace/default-switch filesystem storage with object storage before multi-instance production deployment.
7. Move the opt-in in-process runner to a dedicated queue/worker deployment when production infrastructure is available.

## Security invariants

- Export permissions can never be broader than preview/source-domain permissions.
- Tenant/company/branch scope comes from authenticated context or a trusted job snapshot, never request parameters.
- Storage keys are server-generated and are not accepted from clients.
- Unauthorized/internal columns are rejected before a job is queued.
- Background processing preserves the scope snapshot and never defaults to tenant-wide access.
- Worker authorization is re-evaluated at processing time; queued access is not treated as permanent permission.
- Stored job JSON is revalidated before materialization.
- Artifact downloads re-evaluate current permissions and requester ownership.
- Failed jobs expose bounded business-safe failure summaries, not stack traces or secrets.
- Spreadsheet-formula strings are neutralized in CSV artifacts.
