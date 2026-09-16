# Reporting Phase 2 Progress

Canonical roadmap: `docs/REPORTING-DEVELOPMENT-ROADMAP.md`

Branch: `feature/core-commerce-foundation`

This file records incremental Phase 2 implementation progress without replacing the canonical roadmap.

## Current status

The shared reporting/export foundation is active for Staff Performance, Service Performance, Payment Summary, Customer Performance, Sales Performance, Appointment Performance and Finance Performance. CSV, XLSX and PDF generation are active. Saved Reports, favorites, Recent Reports and Recent Exports are implemented for personal use. Scheduled Reports has persistence, API management, timezone-aware recurrence, idempotent automatic execution, personal run history and a dedicated frontend workspace. Previous-period comparison is available for the current report definitions. Scoped appointment drill-down is available end-to-end for Staff Performance and Service Performance.

## Reporting / export foundation

- Server-owned report definitions, report keys, columns, sort fields, export formats, drill-down capabilities and layered source-domain permissions.
- Strict date/filter/export/drill-down DTOs. Client requests cannot supply tenant/company/branch scope, storage keys, requester identity, SQL or arbitrary Prisma selections.
- Permission-aware report catalog and centralized preview orchestration.
- Persistent `report_export_jobs` queue with authenticated scope and membership/role snapshots.
- CSV, XLSX and PDF worker generation with private filesystem or S3-compatible object storage.
- Worker-time membership, role, branch and source-domain permission revalidation.
- Authenticated owner-only downloads, expiry cleanup, stale PROCESSING recovery and artifact reconciliation.
- Requester-private export history and bounded active-job/materialized-row workload controls.

## Domain reports

### Customer Performance

- `customers.performance` uses a dedicated `CustomerReportingService` and requires `reports.read` + `customers.read`.
- Scope is source-domain owned through `OrganizationScopeService`.
- Visit, completion and collection metrics are exposed without phone, email, birth date, health, consent or care-note fields.
- Available through preview, comparison, CSV/XLSX/PDF, Saved Reports, Scheduled Reports and `/reports/customers`.

### Sales Performance

- `sales.performance` uses `SalesReportingService` and the existing sales-domain `payments.read` permission together with `reports.read`.
- Only `CONFIRMED` sales contribute to sales reporting.
- Revenue, gross/net collection, refunds, outstanding balance, discount and average basket semantics remain distinct.
- Refund reporting respects the source model where a refunded payment transitions from `COMPLETED` to `REFUNDED`, avoiding double subtraction.
- Available through the full Reporting lifecycle and `/reports/sales`.

### Appointment Performance

- `appointments.performance` requires `reports.read` + `appointments.read`.
- Daily metrics include scheduled/confirmed/completed/cancelled/no-show counts and rates, new/repeat behavior, collection, duration and peak-hour demand.
- New vs repeat uses the customer's first appointment within the authenticated scope rather than customer creation date.
- Rebooking uses a 90-day post-completion window and unique completed customers as the denominator.
- Daily/peak-hour grouping is explicitly UTC until an authoritative branch timezone source is introduced.
- Available through the full Reporting lifecycle and `/reports/appointments`.

### Finance Performance

- `finance.performance` requires `reports.read` + `finance.read`.
- The report is intentionally named **Finans Operasyon Özeti**; it is not represented as a statutory P&L or legal financial statement.
- Only approved finance income/expense records in the authenticated tenant/company/branch scope are included.
- Active income collections exclude `income_collection_reversals`; active expense payments exclude `expense_payment_reversals`.
- Record amounts are normalized using each record's stored exchange rate for the current TRY-oriented presentation.
- Income records, expense records, operational margin, collections, payments, net cash movement, open receivables and open payables remain separate metrics.
- Expense payable amount is `gross - withholding`; payment rates and open payable calculations use that payable basis rather than gross expense.
- Available through preview, comparison, CSV/XLSX/PDF, export history, Saved Reports, Scheduled Reports and `/reports/finance`.

## Period comparison

- `POST /reports/compare` accepts only the current report key/date range.
- The previous period is server-computed as the immediately preceding equal-length range.
- Execution reuses normal preview authorization/scope logic and exposes only finite numeric aggregate metrics.

## Drill-down

- `POST /reports/drilldown` accepts server-defined report keys/dimensions only.
- Staff and Service Performance support scoped appointment drill-down.
- Parent entities are scope-validated before child appointment queries.
- Returned child rows exclude customer identity, notes and other sensitive fields.
- Server-owned `_rowId` is preview-only and never exportable.

## Export formats

### CSV

- UTF-8 BOM, structured serialization, quoting/multiline handling and spreadsheet formula-injection neutralization.

### XLSX

- Controlled OOXML workbook with Summary, Detail and Filters/Metadata sheets, typed cells, frozen headers and autofilter.

### PDF

- Server-side PDF generation with report period, summary/detail sections, pagination, server-resolved company/branch branding and `CONFIDENTIAL / GIZLI` footer.
- Current Base14 rendering still normalizes non-ASCII glyphs. True Turkish Unicode fidelity requires an embedded licensed Unicode font asset.
- Logo rendering remains deferred until Company exposes an authoritative brand asset.

## Saved Reports, Favorites and Recents

- Personal `report_saved_views` persistence with authenticated owner/scope derivation.
- Permission revalidation on reopen/change.
- Saved columns/sort are validated against server-owned definitions.
- Favorites, Recent Reports via `last_opened_at`, and Recent Exports are available in Export Center.

## Scheduled Reports

- Personal DAILY/WEEKLY/MONTHLY schedules with validated IANA timezone, dynamic date presets and bounded recurrence fields.
- Durable `report_schedule_runs` ledger and unique `schedule_run_id` prevent duplicate exports under retries/concurrent workers.
- Due schedules use `FOR UPDATE SKIP LOCKED` and revalidate current membership, role, branch and source-domain permissions.
- Delivery remains DOWNLOAD_ONLY until a verified-recipient notification model exists.

## Frontend

Dedicated Reporting workspaces now include:

- `/reports/customers`
- `/reports/sales`
- `/reports/appointments`
- `/reports/finance`
- `/reports/staff`
- `/reports/services`
- `/reports/compare`
- `/reports/exports`
- `/reports/schedules`

The Export Center and schedule/comparison clients consume the authoritative `ReportCatalogKey` contract so new report domains participate in the shared lifecycle without separate client-side permission assumptions.

## Tests / safety coverage

- Report definition, permission, scope-bypass and export-column tests.
- Customer PII-minimization and branch-scope aggregation tests.
- Sales revenue/collection/refund/outstanding semantic tests and lifecycle contract coverage.
- Appointment scope/status/new-repeat/rebooking tests and lifecycle contract coverage.
- Finance tests verify authenticated tenant/company/branch query parameters, reversal exclusion, exchange-rate normalization, withholding-aware payable calculations and lifecycle contract coverage.
- Comparison, drill-down, export presenter, worker authorization, storage/download, stale recovery, expiry, workload, Saved Report and schedule execution tests remain in place.
- The web workspace still has no dedicated frontend test runner; UI validation currently relies on monorepo lint/typecheck/build plus backend contract tests.

## Current CI note

Prisma schema validation passes. In Monorepo quality run `#4442`, all Reporting migrations applied successfully before the migration chain failed at unrelated migration `20260915220500_approval_runtime`: it references `approval_workflow_definitions` before that relation exists. API typecheck/tests/E2E/build and web lint/typecheck/build were therefore skipped. Reporting must not be called fully green until a descendant run reaches and passes those stages.

## Next Phase 2 increments

1. Inventory and Procurement reporting.
2. CRM pipeline/conversion/communication reporting.
3. HR/Payroll and branch/executive reporting packs.
4. Export/schedule lifecycle audit events when a shared platform audit service is available for Reporting consumption.
5. Authoritative brand assets and embedded Unicode PDF font support.
6. Dedicated queue/worker deployment, verified-recipient delivery and coordinated frontend test infrastructure.

## Security invariants

- Report permissions never exceed current source-domain permissions.
- Tenant/company/branch and ownership derive from authenticated context/trusted snapshots, never request scope overrides.
- No client-controlled SQL, Prisma selection or arbitrary report/dimension query surface is exposed.
- Sensitive customer data remains excluded without explicit field-level permission/audit controls.
- Previous-period ranges are server-derived.
- Drill-down identities/dimensions are server-controlled and non-exportable.
- Finance reports exclude reversed collections/payments and preserve income/expense/cash/payable semantic distinctions.
- Storage keys and schedule-run idempotency keys are server-generated only.
- Stored job/schedule JSON is revalidated before execution and downloads revalidate current ownership/permissions.
