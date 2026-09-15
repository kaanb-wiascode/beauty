# Reporting Phase 2 Progress

Canonical roadmap: `docs/REPORTING-DEVELOPMENT-ROADMAP.md`

Branch: `feature/core-commerce-foundation`

This file records incremental Phase 2 implementation progress without replacing the canonical roadmap.

## Completed export foundation items

- Server-owned export capabilities on each `ReportDefinition`.
- Explicit `exportableColumns` separate from preview-visible columns.
- Export capability advertisement is implementation-aware: definitions currently expose only `CSV`; `PDF` and `XLSX` remain transport-contract values for future generators but cannot be queued until implemented.
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
- Report export storage is driver-based: local/dev defaults to contained filesystem storage, while `REPORT_EXPORT_STORAGE_DRIVER=object` reuses the shared private S3-compatible `ObjectStorageService` for multi-instance deployments.
- Object-storage writes use server-generated keys and signed PUT requests; reads use signed GET requests; expiry cleanup uses authenticated DELETE requests. Client input never supplies storage URLs or storage keys.
- Object-storage tests cover PUT/GET/DELETE integration, content type propagation, generated keys and fail-closed upload errors.
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
- Web export client supports queue creation, scoped history retrieval and authenticated artifact download.
- Reusable `ReportExportPanel` shows queued/processing/ready/failed/expired states and polls only while work is pending.
- `/reports/exports` provides a permission-aware Export Center for Staff, Service and Payment reports with shared date filters, CSV queue creation, history and download actions.
- Reports navigation exposes the Export Center only to users with `reports.read`; source-domain report choices are additionally filtered by the user's current domain permissions.
- Shared report date validation now rejects missing, malformed and inverted date ranges before ISO conversion, preventing cleared date inputs from throwing `Invalid Date` errors in preview/export flows.
- `.env.example` documents export storage driver, local storage directory, retention and worker enablement settings.

## Intentional implementation note

`report_export_jobs` is currently created by explicit migrations and accessed through server-owned, parameterized Prisma SQL fragments. Client input is never interpolated as SQL identifiers, table names, expressions or raw query fragments.

The generated Prisma schema model still requires synchronization. The active `schema.prisma` is receiving concurrent HR/Finance changes on the shared branch and the available GitHub write path replaces the complete file rather than applying a line patch, so this pass deliberately did not risk overwriting unrelated schema work. Until a safe schema patch can be applied, do not generate future migrations that attempt to recreate or drop `report_export_jobs` based on schema drift.

The filesystem provider remains the safe local/default option. Multi-instance deployments can now select the existing private S3-compatible object storage through `REPORT_EXPORT_STORAGE_DRIVER=object` without changing export-job semantics or exposing public storage paths.

No XLSX/workbook library is currently declared in the API workspace, and CI installs with `pnpm install --frozen-lockfile`. Do not add an XLSX dependency through `package.json` alone; the workspace lockfile must be regenerated and committed atomically with that dependency before XLSX implementation is enabled.

The web workspace currently has no frontend test runner configured. Adding React/UI tests requires a deliberate dependency + lockfile change; until then, web changes continue to be covered by lint/typecheck/build in the monorepo quality workflow and by pure shared validation helpers where possible.

## Current CI note

Recent monorepo quality runs validate the Prisma schema but have been stopping during migration deployment in the unrelated Platform migration `20260915150000_platform_privileged_governance`, because that migration inserts into `platform_permissions` before that relation exists at that point in migration order. The newest descendant workflow was still pending with no jobs at the last check. Do not classify Reporting CI as green until a descendant run passes migration deployment and reaches API typecheck/tests/E2E/build.

## Next Phase 2 increments

1. Synchronize `ReportExportJob` into the active Prisma schema when a safe line-level schema patch or coordinated database window is available.
2. Add XLSX workbook generation with typed numeric/date cells, column widths and metadata sheets after an XLSX dependency and lockfile are committed atomically.
3. Add server-side PDF report generation.
4. Add export audit events once the shared AuditLog persistence/service is implemented.
5. Move the opt-in in-process runner to a dedicated queue/worker deployment when production infrastructure is available.
6. Add frontend tests for export-center permission filtering, polling lifecycle and download state transitions when a web test runner is introduced.

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
