# Reporting Phase 2 Progress

Canonical roadmap: `docs/REPORTING-DEVELOPMENT-ROADMAP.md`

Branch: `feature/core-commerce-foundation`

This file records incremental Phase 2 implementation progress without replacing the canonical roadmap.

## Current status

The shared reporting/export foundation is implemented for Staff Performance, Service Performance and Payment Summary. CSV, XLSX and PDF generation are active. Saved Reports, favorites, Recent Reports and Recent Exports are implemented for personal use. Scheduled Reports now has persistence, API management, timezone-aware recurrence, an idempotent execution ledger, automatic due-run queueing, personal run history and a dedicated frontend management workspace.

## Reporting / export foundation

- Server-owned report definitions, report keys, columns, sort fields, export formats and layered source-domain permissions.
- Strict date/filter/export DTOs. Client requests cannot supply tenant/company/branch scope, storage keys, requester identity, SQL or arbitrary Prisma selections.
- Permission-aware report catalog and centralized preview orchestration.
- Persistent `report_export_jobs` queue with authenticated scope and membership/role snapshots.
- Export lifecycle: `QUEUED`, `PROCESSING`, `READY`, `FAILED`, `EXPIRED`.
- Atomic worker claiming with `FOR UPDATE SKIP LOCKED`.
- Worker-time membership, role, branch and source-domain permission revalidation.
- Request-scoped tenant context reconstruction for background materialization.
- CSV, XLSX and PDF worker generation.
- Filesystem or private S3-compatible object storage.
- Authenticated owner-only downloads with current permission revalidation.
- Retention, expiry cleanup, stale PROCESSING recovery and artifact reconciliation.
- Public export responses hide storage keys and internal tenant/membership/role/requester snapshots.
- Requester-private paginated export history.
- Workload guards: bounded active requester jobs and materialized row limits.
- Export Center supports visible columns vs server-owned all-permitted columns and optional summary output.

## Export formats

### CSV

- UTF-8 BOM, quoting, multiline values and Turkish-character support.
- Structured value serialization.
- Spreadsheet formula-injection neutralization.

### XLSX

- Controlled OOXML workbook generation without introducing an uncoordinated lockfile dependency.
- Summary, Detail and Filters/Metadata sheets.
- Typed numeric/date/string cells where applicable.
- Frozen detail header and autofilter.
- Only already-authorized server-owned columns reach workbook generation.

### PDF

- Server-side PDF generation with title, reporting period, summary, detail rows, page splitting and page numbering.
- Company and branch names are resolved server-side from the authenticated tenant/company/branch context; clients cannot supply PDF branding text.
- Branded hierarchy now uses regular/bold font resources, company/branch heading, report title hierarchy and a per-page `CONFIDENTIAL / GIZLI` footer.
- Missing/inactive company metadata falls back to `WiOS 360` without leaking cross-tenant data.
- Current Base14 implementation still normalizes non-ASCII glyphs. A real embedded Unicode font asset is required before Turkish characters can be preserved verbatim in PDF output.
- Logo rendering is intentionally pending because the current Company model does not expose an authoritative logo/brand asset field.

## Saved Reports, Favorites and Recents

- Persistent personal `report_saved_views` storage and Prisma model.
- Scope/owner derived only from authenticated context.
- Strict report/date/column/sort/favorite contracts.
- CRUD endpoints under `/reports/saved-reports`.
- Current source-domain permissions are re-evaluated when a saved report is opened or changed.
- Saved columns and sort keys are checked against server-owned report definitions.
- Export Center can save/apply/favorite/delete personal views.
- `last_opened_at` is updated only after permission-safe reopen.
- Recent Reports uses `last_opened_at`; Recent Exports reuses requester-private export history.
- Shared/team saved reports are intentionally deferred until an explicit ownership/permission model exists.

## Scheduled Reports

- Persistent personal `report_schedules` storage and Prisma model.
- Tenant/company/branch/owner/membership/role snapshot fields are server-derived and cannot be supplied by request bodies.
- DAILY / WEEKLY / MONTHLY recurrence with bounded hour/minute, ISO weekday and monthly day 1-28 rules.
- IANA timezone validation and timezone-aware `next_run_at` calculation.
- Dynamic date presets: `TODAY`, `YESTERDAY`, `LAST_7_DAYS`, `LAST_30_DAYS`, `THIS_MONTH`, `PREVIOUS_MONTH`.
- Schedule CRUD endpoints under `/reports/schedules`.
- Format, exportable columns and sort fields are revalidated against report definitions.
- Arbitrary recipient addresses are not accepted. Delivery remains DOWNLOAD_ONLY until a verified-recipient notification model exists.

### Idempotent automatic execution

- `report_schedule_runs` is the durable execution ledger.
- `(schedule_id, scheduled_for)` is unique so a recurrence window receives one ledger identity.
- Export jobs have a server-only unique `schedule_run_id` idempotency key.
- Retried/concurrent workers therefore converge on the same export job instead of creating duplicates.
- Due schedules are selected with `FOR UPDATE SKIP LOCKED`.
- Existing `CLAIMED`/`QUEUED`/`FAILED` ledger rows repair crash windows instead of silently losing the schedule occurrence.
- A successfully created export job can recover a concurrent transient FAILED ledger state back to QUEUED.
- Current membership, role, branch, report/domain permission and workload limits are revalidated before scheduled queueing.
- Stored schedule JSON is strictly revalidated before synthesizing an export request.
- Dynamic report date ranges are resolved at run time in the schedule's timezone.
- The export worker queues due schedules before consuming export jobs, allowing a newly scheduled job to process in the same tick.
- Schedule worker batch size is bounded by `REPORT_SCHEDULE_BATCH_SIZE` (default 5, allowed 1-20).
- `GET /reports/schedules/:id/runs` exposes requester-owned, permission-safe execution history without internal auth snapshots.

## Frontend

- `/reports/exports` uses the authoritative `/reports/catalog` rather than cached local permission assumptions.
- PDF / Excel / CSV selection.
- Saved Reports, favorites, Recent Reports and Recent Exports.
- Personal paginated export history and pending polling.
- Authenticated binary download shares normal refresh-token behavior.
- Dedicated `/reports/schedules` workspace is linked from the Reports navigation.
- Schedule creation uses the permission-aware report catalog, report-owned export formats, exportable columns and current report sort contract.
- Users can configure daily/weekly/monthly cadence, local run time, dynamic date preset, output format and summary inclusion.
- Browser IANA timezone is submitted explicitly; the API remains authoritative for validation and next-run calculation.
- Existing schedules can be paused/resumed or deleted from the workspace.
- Personal execution history shows scheduled time, QUEUED/FAILED lifecycle and bounded failure code without exposing internal auth snapshots.

## Tests / safety coverage

- Report definition, permission and export-column policy tests.
- Scope-bypass and DTO validation tests.
- Public presenter metadata-leak tests.
- Worker authorization, stored-payload, stale-worker, expiry, storage and download tests.
- CSV/XLSX/PDF generator tests.
- PDF branding tests cover server-scoped company/branch lookup, safe fallback, bold hierarchy and confidentiality labeling.
- Artifact reconciliation tests.
- Workload-limit tests.
- Saved Report permission/recent-open tests.
- Schedule recurrence/timezone/date-preset tests.
- Scheduled execution tests cover idempotency keys, queued-run recovery, authorization revocation and tampered stored payloads.
- Worker ordering test verifies due schedules are queued before normal export processing.
- The web workspace still has no dedicated test runner; schedule UI validation currently relies on monorepo lint/typecheck/build plus backend contract tests.

## Current CI note

A descendant `Monorepo quality` run must reach and pass API typecheck/tests/E2E/build plus web lint/typecheck/build before Reporting is classified fully green. Do not infer success while the workflow is pending or in progress.

## Next Phase 2 increments

1. Add export/schedule audit events when the shared AuditLog service is available.
2. Add an authoritative brand asset model and embedded Unicode font support before enabling true Unicode/logo PDF rendering.
3. Add verified-recipient delivery only after the platform notification/recipient model exists.
4. Move in-process scheduling/export execution to a dedicated queue/worker deployment when infrastructure is available.
5. Add coordinated frontend test infrastructure.
6. Continue into drill-down, comparisons and additional report domains.

## Security invariants

- Report/export permissions can never exceed current source-domain permissions.
- Tenant/company/branch and ownership come from authenticated context/trusted snapshots, never client scope parameters.
- PDF company/branch branding is resolved from authenticated server context, never arbitrary client strings.
- Storage keys and scheduled-run idempotency keys are server-generated only.
- Unauthorized/internal columns cannot reappear through saved reports, schedules or exports.
- Scheduled execution revalidates membership, role, branch and permissions at run time.
- Stored job/schedule JSON is revalidated before materialization or queueing.
- Downloads revalidate requester ownership and current permissions.
- Failed jobs/runs expose bounded business-safe summaries, never stack traces or secrets.
