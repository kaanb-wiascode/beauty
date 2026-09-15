# Reporting Phase 2 Progress

Canonical roadmap: `docs/REPORTING-DEVELOPMENT-ROADMAP.md`

Branch: `feature/core-commerce-foundation`

This file records incremental Phase 2 implementation progress without replacing the canonical roadmap.

## Current status

The shared export foundation is implemented for the current Staff Performance, Service Performance and Payment Summary reports. Server-owned report definitions now advertise the formats that have an implemented worker generator: **CSV, XLSX and PDF**.

## Completed export foundation

- Server-owned `exportableColumns`, export format capabilities and layered source-domain permissions.
- Strict export DTOs; clients cannot supply tenant/company/branch scope, SQL, Prisma selections, storage keys or arbitrary report identifiers.
- Persistent `report_export_jobs` queue with authenticated scope, membership/role snapshot, requester, filters, columns, sort, lifecycle timestamps, row count, retention and bounded failure metadata.
- Lifecycle states: `QUEUED`, `PROCESSING`, `READY`, `FAILED`, `EXPIRED`.
- `POST /reports/exports`, paginated/filterable `GET /reports/exports`, get-by-id and authenticated download endpoints.
- Personal history filtering through server-derived `mine=true`; arbitrary requester/scope filters are rejected.
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

## Frontend

- Permission-aware `/reports/exports` Export Center.
- Reusable `ReportExportPanel`.
- PDF / Excel (.xlsx) / CSV selector.
- Personal paginated export history.
- QUEUED / PROCESSING / READY / FAILED / EXPIRED states.
- Polling only while jobs are pending.
- Authenticated artifact download with format-aware filename fallback.
- Shared date validation prevents missing/malformed/inverted date ranges from reaching export creation.

## Tests added

- Report definition/export permission and column policy tests.
- Export request DTO and scope-bypass tests.
- Worker success/failure, authorization revalidation and tampered-payload tests.
- Artifact reconciliation tests for pre-commit failure, acknowledgement loss, cleanup failure and unverifiable persisted state.
- CSV generator tests.
- XLSX generator and worker integration tests.
- PDF generator tests including metadata/detail output and multi-page pagination.
- Storage filesystem/object-driver tests.
- Stale worker, expiry and download tests.
- Reporting HTTP/E2E coverage for queue creation, history, get-by-id and invalid requester/scope fields.

## Intentional implementation notes

`report_export_jobs` is currently created by explicit migrations and accessed through server-owned parameterized Prisma SQL fragments. The generated Prisma schema model still requires synchronization. Because the shared `schema.prisma` receives concurrent HR/Finance changes and the current GitHub write path replaces the complete file, do not overwrite it without a coordinated safe patch window.

The in-process worker is appropriate for the current incremental implementation. A dedicated queue/worker deployment remains the production scaling target.

The web workspace still has no dedicated frontend test runner. UI changes currently depend on monorepo lint/typecheck/build plus backend contract tests until a coordinated dependency/lockfile change introduces a web test harness.

## Current CI note

Do not classify Reporting as green until a descendant `Monorepo quality` run reaches and passes API typecheck/tests/E2E/build. Recent runs have previously stopped at an unrelated Platform migration ordering issue before reaching Reporting checks.

## Next Phase 2 increments

1. Synchronize `ReportExportJob` into the active Prisma schema during a coordinated schema patch window.
2. Add export audit events when the shared AuditLog persistence/service is available.
3. Improve PDF presentation quality: embedded Unicode font, company/legal-entity branding, logo, confidentiality labels, styled tables and optional controlled charts.
4. Add export concurrency/rate/row-limit policies based on production workload.
5. Move the runner to a dedicated queue/worker deployment when infrastructure is available.
6. Add frontend tests for permission filtering, polling lifecycle and download transitions when the web test runner is introduced.
7. Continue the roadmap into saved reports, favorites/recent reports, scheduled reports, drill-down/comparison and additional report domains.

## Security invariants

- Export permissions can never exceed preview/source-domain permissions.
- Tenant/company/branch scope comes from authenticated context or a trusted job snapshot, never request parameters.
- Export requester filters are derived from the authenticated principal.
- Storage keys are server-generated and never accepted from clients.
- Unauthorized/internal columns are rejected before queueing.
- Worker authorization is re-evaluated at processing time.
- Stored job JSON is revalidated before materialization.
- Downloads re-evaluate current permissions and requester ownership.
- Failed jobs expose bounded business-safe summaries rather than stack traces or secrets.
- CSV spreadsheet-formula strings are neutralized.
- XLSX/PDF generation receives only the already-authorized materialized column set.
