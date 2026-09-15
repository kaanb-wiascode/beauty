# Reporting Phase 2 Progress

Canonical roadmap: `docs/REPORTING-DEVELOPMENT-ROADMAP.md`

Branch: `feature/core-commerce-foundation`

This file records incremental Phase 2 implementation progress without replacing the canonical roadmap.

## Current status

The shared export foundation is implemented for the current Staff Performance, Service Performance and Payment Summary reports. Server-owned report definitions advertise the formats that have an implemented worker generator: **CSV, XLSX and PDF**. Saved Reports is implemented end-to-end for personal views with requester ownership, favorites, permission revalidation and recent-use tracking.

## Completed export foundation

- Server-owned `exportableColumns`, export format capabilities and layered source-domain permissions.
- Strict export DTOs; clients cannot supply tenant/company/branch scope, SQL, Prisma selections, storage keys or arbitrary report identifiers.
- Persistent `report_export_jobs` queue with authenticated scope, membership/role snapshot, requester, filters, columns, sort, lifecycle timestamps, row count, retention and bounded failure metadata.
- Multi-file Prisma schema includes `ReportExportJob` in `packages/database/prisma/reporting.prisma`, matching the migration-owned table and representable indexes. The PostgreSQL partial branch index remains migration-owned because Prisma schema syntax does not represent partial indexes.
- Lifecycle states: `QUEUED`, `PROCESSING`, `READY`, `FAILED`, `EXPIRED`.
- `POST /reports/exports`, paginated/filterable `GET /reports/exports`, get-by-id and authenticated download endpoints.
- Export history is requester-private by default; arbitrary requester/scope filters and `mine=false` are rejected until an explicit shared-history permission model exists.
- Public export API responses are projected through a presenter and never expose storage keys, tenant/company/branch snapshots, membership/role identifiers or requester internals.
- Download is restricted to the original requester, READY/non-expired jobs and current report/source-domain permissions.
- Atomic worker claiming with `FOR UPDATE SKIP LOCKED` and guarded PROCESSING transitions.
- Worker-time membership, role, branch and domain-permission revalidation.
- Request-scoped `TenantContext` reconstruction for background materialization.
- Existing Staff/Service/Payment services remain authoritative for report calculations.
- Opt-in worker runner with bounded polling/batches, no same-process overlap, structured operational logs and no public process endpoint.
- Stale PROCESSING watchdog marks timed-out jobs FAILED with `WORKER_TIMEOUT` instead of blindly requeueing ambiguous external side effects.
- Artifact reconciliation protects the upload -> READY boundary: exact orphan artifacts are best-effort deleted when READY did not commit; artifacts are preserved when the READY commit may have succeeded but acknowledgement was lost.
- Configurable filesystem/object-storage driver. Object mode reuses the platform's private S3-compatible `ObjectStorageService` using server-generated keys, signed PUT/GET and authenticated delete.
- Configurable retention and expiry cleanup.
- Export UI supports visible columns vs server-owned all-permitted columns plus optional summary inclusion. `ALL_PERMITTED` resolves only from `ReportDefinition.exportableColumns`; preview-only/internal columns cannot reappear.
- Workload guards bound active requester jobs and materialized row counts. Defaults: 3 active jobs/requester and 50,000 rows/export, both server-configurable within bounded ranges.

## Implemented formats

### CSV

- UTF-8 BOM.
- Predictable quoting for commas, quotes and multiline values.
- Turkish-character coverage.
- Structured-value serialization.
- Spreadsheet formula-injection neutralization.

### XLSX

- Dependency-free controlled OOXML workbook writer, avoiding an uncoordinated package/lockfile change on the shared branch.
- Real `.xlsx` ZIP/OOXML artifact generation.
- Summary, Detail and Filters/Metadata worksheets.
- Typed numeric/date/string cells where applicable.
- Frozen detail header and autofilter.
- Server-owned selected columns only; unauthorized/internal columns cannot reappear in the workbook.
- Worker/storage/download integration and frontend Excel selection.

### PDF

- Dependency-free server-side PDF writer.
- Report title, report key, reporting period and generation timestamp.
- Optional summary metrics.
- Detail table output.
- Automatic multi-page splitting and page numbering.
- Worker/storage/download integration and frontend PDF selection.
- Current Base14-font implementation normalizes non-ASCII/Turkish glyphs for deterministic rendering. Embedded Unicode brand fonts, company logo, richer layout and charts remain a presentation-quality follow-up rather than an authorization/export-pipeline blocker.

## Saved Reports, Favorites and Recents

- Persistent `report_saved_views` storage and multi-file Prisma model.
- Personal ownership only; tenant/company/branch/owner scope is derived from authenticated context and never accepted from the client.
- Strict create/update DTOs for report key, date range, columns, sort, favorite state and name.
- CRUD endpoints under `/reports/saved-reports`.
- Saved report list/get/update re-evaluates current report/source-domain permission instead of trusting permissions from save time.
- Saved columns and sort keys are checked against server-owned report definitions before persistence.
- Export Center can save the current report/date/column/sort configuration, list personal saved reports, re-apply a saved configuration, favorite/unfavorite it and delete it.
- Applying a saved report performs an authenticated GET and updates `last_opened_at` only after permission revalidation succeeds.
- Recent Reports is derived from permission-safe `last_opened_at` data rather than mutation timestamps.
- Recent Exports reuses requester-private export history across all authorized report keys and supports READY artifact download.
- Sharing is intentionally not enabled yet.

## Frontend

- Permission-aware `/reports/exports` Export Center.
- Export Center uses the server-owned `/reports/catalog` rather than local cached permission state to determine available reports.
- Reusable `ReportExportPanel`.
- PDF / Excel (.xlsx) / CSV selector.
- Visible-columns vs all-permitted-columns export mode.
- Optional summary inclusion.
- Saved Reports, favorites and Recent Reports UX.
- Cross-report Recent Exports section with refresh and READY download.
- Personal paginated export history.
- QUEUED / PROCESSING / READY / FAILED / EXPIRED states.
- Polling only while jobs are pending.
- Authenticated artifact download shares the normal API refresh-token behavior and uses format-aware filename fallback.
- Shared date validation prevents missing/malformed/inverted date ranges from reaching export creation.

## Tests added

- Report definition/export permission and column policy tests.
- Export request DTO and scope-bypass tests.
- Public export presenter tests preventing internal metadata leakage.
- Worker success/failure, authorization revalidation and tampered-payload tests.
- Artifact reconciliation tests for pre-commit failure, acknowledgement loss, cleanup failure and unverifiable persisted state.
- Workload policy and oversized-materialization tests.
- CSV generator tests.
- XLSX generator and worker integration tests.
- PDF generator tests including metadata/detail output and multi-page pagination.
- Storage filesystem/object-driver tests.
- Stale worker, expiry and download tests.
- Saved Report DTO boundary, permission-revalidation and recent-open tracking tests.
- Reporting HTTP/E2E coverage for queue creation, requester-private history, get-by-id and invalid requester/scope fields.

## Intentional implementation notes

`report_export_jobs` is created by explicit migrations and continues to be accessed by server-owned, parameterized Prisma SQL fragments in the repository. The multi-file Prisma schema is synchronized through `prisma/reporting.prisma`.

Saved Reports are deliberately personal in the first implementation. Shared/team reports require an explicit permission and ownership model before they are exposed.

The in-process worker is appropriate for the current incremental implementation. A dedicated queue/worker deployment remains the production scaling target.

The web workspace still has no dedicated frontend test runner. UI changes currently depend on monorepo lint/typecheck/build plus backend contract tests until a coordinated dependency/lockfile change introduces a web test harness.

## Current CI note

Prisma schema validation passes. The latest observed quality pipeline stopped on an unrelated HR migration seed referencing `companies.tenant_id` while the existing table exposes `"tenantId"`. Reporting migrations applied successfully before that blocker. Do not classify Reporting as fully green until a descendant `Monorepo quality` run reaches and passes API typecheck/tests/E2E/build.

## Next Phase 2 increments

1. Add export audit events when the shared AuditLog persistence/service is available.
2. Improve PDF presentation quality: embedded Unicode font, company/legal-entity branding, logo, confidentiality labels, styled tables and optional controlled charts.
3. Add scheduled reports with timezone, recipient, format and retry/history controls.
4. Move the runner to a dedicated queue/worker deployment when infrastructure is available.
5. Add frontend tests for permission filtering, polling lifecycle, saved reports and download transitions when the web test runner is introduced.
6. Continue the roadmap into drill-down/comparison and additional report domains.

## Security invariants

- Export permissions can never exceed preview/source-domain permissions.
- Tenant/company/branch scope comes from authenticated context or a trusted job snapshot, never request parameters.
- Export requester filters are derived from the authenticated principal.
- Saved Report scope and ownership are derived from the authenticated principal.
- Saved Reports re-evaluate current source-domain permissions before opening or mutation.
- Recent Report usage timestamps are written only after permission-safe reopen.
- Storage keys are server-generated and never accepted from clients.
- Unauthorized/internal columns are rejected before queueing or saving a report view.
- Worker authorization is re-evaluated at processing time.
- Stored job JSON is revalidated before materialization.
- Downloads re-evaluate current permissions and requester ownership.
- Failed jobs expose bounded business-safe summaries rather than stack traces or secrets.
- CSV spreadsheet-formula strings are neutralized.
- XLSX/PDF generation receives only the already-authorized materialized column set.
