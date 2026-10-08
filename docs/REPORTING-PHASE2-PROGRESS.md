# Reporting Phase 2 Progress

Canonical roadmap: `docs/REPORTING-DEVELOPMENT-ROADMAP.md`

Branch: `feature/core-commerce-foundation`

This file records incremental Phase 2 implementation progress without replacing the canonical roadmap.

## Current status

The shared Reporting Platform is active across Staff Performance, Service Performance, Payment Summary, Customer Performance, Sales Performance, Appointment Performance, Finance Performance, Inventory Performance, Procurement Performance, CRM Performance, HR Workforce, Payroll Summary and Branch Performance.

The common lifecycle now covers permission-aware catalog discovery, preview, server-owned summaries, previous-period comparison, CSV/XLSX/PDF export, requester-private export history, Saved Reports, favorites, Recent Reports, Scheduled Reports and dedicated frontend workspaces. Scoped appointment drill-down is available for Staff Performance, Service Performance, Customer Performance, Branch Performance and UTC day rows in Appointment Performance.

The legacy `/reports/staff-performance`, `/reports/service-performance` and `/reports/payment-summary` dependencies have been removed from the Report Center and Executive workspace. Both now consume the shared preview/catalog contracts.

## Reporting / export foundation

- Server-owned report definitions, report keys, columns, sort fields, export formats, drill-down capabilities and layered source-domain permissions.
- Strict date/filter/export/drill-down DTOs. Client requests cannot supply tenant/company/branch scope, storage keys, requester identity, SQL or arbitrary Prisma selections.
- Permission-aware report catalog and centralized preview orchestration.
- Persistent `report_export_jobs` queue with authenticated scope and membership/role snapshots.
- CSV, XLSX and PDF worker generation with private filesystem or S3-compatible object storage.
- Worker-time membership, role, branch and source-domain permission revalidation.
- Authenticated owner-only downloads, expiry cleanup, stale PROCESSING recovery and artifact reconciliation.
- Requester-private export history and bounded active-job/materialized-row workload controls.
- Previous-period comparison reuses normal preview authorization/scope and extracts only finite numeric summary fields.

## Domain reports

### Customer Performance

- `customers.performance` uses a dedicated `CustomerReportingService` and requires `reports.read` + `customers.read`.
- Scope is source-domain owned through `OrganizationScopeService`.
- Visit, completion and collection metrics are exposed without phone, email, birth date, health, consent or care-note fields.
- Available through the shared Reporting lifecycle and `/reports/customers`.
- Customer rows expose only a server-owned preview `_rowId`; appointment drill-down revalidates organization scope and does not expose customer contact, health, consent or care-note fields.

### Sales Performance

- `sales.performance` uses `SalesReportingService` and the existing sales-domain `payments.read` permission together with `reports.read`.
- Only `CONFIRMED` sales contribute to sales reporting.
- Revenue, gross/net collection, refunds, outstanding balance, discount and average basket semantics remain distinct.
- Refund reporting respects the source model where a refunded payment transitions from `COMPLETED` to `REFUNDED`, avoiding double subtraction.
- Available through the shared Reporting lifecycle and `/reports/sales`.

### Appointment Performance

- `appointments.performance` requires `reports.read` + `appointments.read`.
- Daily metrics include scheduled/confirmed/completed/cancelled/no-show counts and rates, new/repeat behavior, collection, duration and peak-hour demand.
- New vs repeat uses the customer's first appointment within the authenticated scope rather than customer creation date.
- Rebooking uses a 90-day post-completion window and unique completed customers as the denominator.
- Daily/peak-hour grouping is explicitly UTC until an authoritative branch timezone source is introduced.
- Available through the shared Reporting lifecycle and `/reports/appointments`.
- Daily rows use the existing UTC report bucket (`YYYY-MM-DD`) as a server-owned preview identity. Drill-down intersects that UTC day with the original report filter and organization scope before loading appointment rows.

### Finance Performance

- `finance.performance` requires `reports.read` + `finance.read`.
- The report is intentionally named **Finans Operasyon Özeti**; it is not represented as a statutory P&L or legal financial statement.
- Only approved finance income/expense records in the authenticated tenant/company/branch scope are included.
- Active income collections exclude `income_collection_reversals`; active expense payments exclude `expense_payment_reversals`.
- Record amounts are normalized using each record's stored exchange rate for the current TRY-oriented presentation.
- Income records, expense records, operational margin, collections, payments, net cash movement, open receivables and open payables remain separate metrics.
- Expense payable amount is `gross - withholding`; payment rates and open payable calculations use that payable basis rather than gross expense.
- Available through the shared Reporting lifecycle and `/reports/finance`.

### Inventory Performance

- `inventory.performance` reports authenticated warehouse-scope stock movements by movement type, quantity, movement count and recorded movement cost value.
- Scope is source-domain owned and client requests cannot widen warehouse/branch scope.
- Available through the shared Reporting lifecycle and `/reports/inventory`.

### Procurement Performance

- `procurement.performance` reports scoped purchase order count, order value, line count, received count and receipt rate.
- Tenant/company/branch scope is derived from authenticated context.
- Available through the shared Reporting lifecycle and `/reports/procurement`.

### CRM Performance

- `crm.performance` reports daily lead, qualification, conversion, opportunity, pipeline and won-value metrics.
- Report access requires the Reporting permission layered with the CRM source-domain permission.
- Available through the shared Reporting lifecycle and `/reports/crm`.

### HR Workforce

- `hr.workforce` keeps attendance, absence, worked minutes, overtime and leave activity separate from sensitive payroll data.
- Available through the shared Reporting lifecycle and `/reports/hr`.

### Payroll Summary

- `payroll.summary` requires `reports.read`, `hr.read` and `hr_sensitive.read`.
- Gross/net salary, employer cost, salary settlement and liability metrics remain protected behind the sensitive HR permission boundary.
- Available through the shared Reporting lifecycle and `/reports/payroll`.

### Branch Performance

- `branches.performance` aggregates appointment operations by branch without accepting a client-supplied branch scope override.
- The data source reuses `OrganizationScopeService.getBranchScopedWhere()`, so rows are limited to the authenticated user's allowed branch set.
- Metrics include appointment count, completed/cancelled/no-show counts, resolved completion/no-show rates, completed-payment collection and average collection per completed appointment.
- Only payments in `COMPLETED` state contribute to collected revenue.
- Available through preview, previous-period comparison, CSV/XLSX/PDF export, Saved Reports, Scheduled Reports and `/reports/branches`.
- Branch rows retain the internal branch UUID only as preview `_rowId`; appointment drill-down validates the branch against active company/organization scope before querying children.

## Executive / Report Center

- `/reports` now uses the permission-aware report catalog rather than removed legacy report endpoints.
- Staff, service and payment headline metrics are loaded through `/reports/preview`.
- Partial source-domain failures no longer make the entire Report Center unusable; available authorized report cards remain visible.
- `/reports/executive` uses the shared Reporting Platform contracts for staff/service/payment metrics instead of legacy endpoints.
- Staff/service ranking uses server-side sort + bounded preview rather than downloading all rows for client-side aggregation.

## Period comparison

- `POST /reports/compare` accepts only the current report key/date range.
- The previous period is server-computed as the immediately preceding equal-length range.
- Execution reuses normal preview authorization/scope logic and exposes only finite numeric aggregate metrics.
- Comparison summary extraction uses `unknown` + record guards; no broad `any` contract is required.
- Branch Performance participates automatically through the same report definition and preview lifecycle.

## Drill-down

- `POST /reports/drilldown` accepts server-defined report keys/dimensions only.
- Staff, Service, Customer and Branch Performance support scoped appointment drill-down; Appointment Performance supports UTC day-row drill-down.
- Entity parent rows are scope-validated before child queries, and every child appointment query independently reapplies `OrganizationScopeService` scope.
- Appointment day drill-down accepts only a valid UTC `YYYY-MM-DD` row identity and intersects it with the original report filter before querying.
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

Dedicated Reporting workspaces include:

- `/reports`
- `/reports/customers`
- `/reports/sales`
- `/reports/appointments`
- `/reports/finance`
- `/reports/inventory`
- `/reports/procurement`
- `/reports/crm`
- `/reports/hr`
- `/reports/payroll`
- `/reports/branches`
- `/reports/staff`
- `/reports/services`
- `/reports/compare`
- `/reports/executive`
- `/reports/exports`
- `/reports/schedules`

The Report Center, Export Center and schedule/comparison clients consume the authoritative `ReportCatalogKey` contract so new report domains participate in the shared lifecycle without separate client-side permission assumptions.

## Tests / safety coverage

- Report definition, permission, scope-bypass and export-column tests.
- Customer PII-minimization and branch-scope aggregation tests.
- Sales revenue/collection/refund/outstanding semantic tests and lifecycle contract coverage.
- Appointment scope/status/new-repeat/rebooking tests and lifecycle contract coverage.
- Finance tests verify authenticated tenant/company/branch query parameters, reversal exclusion, exchange-rate normalization, withholding-aware payable calculations and lifecycle contract coverage.
- Inventory and Procurement tests cover authenticated scope and numeric aggregate normalization.
- Branch Performance unit coverage verifies authenticated organization scope is preserved and non-completed payments do not contribute to collection.
- Comparison, drill-down, export presenter, worker authorization, storage/download, stale recovery, expiry, workload, Saved Report and schedule execution tests remain in place.
- The web workspace still has no dedicated frontend test runner; UI validation currently relies on monorepo lint/typecheck/build plus backend contract tests.

## Current CI note

Monorepo quality run `#5053` on commit `3d5b4b1811492c5337293d01d969bfc7f91a98c3` completed successfully. The verified chain includes workspace install, Prisma validation/migrations/generation, database/shared-contract typecheck and build, API typecheck, API unit tests, API E2E, API production build, web lint, web typecheck and web production build.

The previous `#4442` migration failure is no longer representative of the branch state; later hardening work repaired the migration/CI chain and established a full-green baseline.

## Next Phase 2 increments

1. Add export/schedule lifecycle audit events when a shared platform audit service is available for Reporting consumption.
2. Introduce authoritative company/branch brand assets and an embedded licensed Unicode font for full Turkish PDF fidelity.
3. Move heavy export execution to a dedicated queue/worker deployment and add verified-recipient delivery.
4. Add coordinated frontend component/E2E test infrastructure for Reporting workspaces.
5. Evaluate deeper server-owned drill-down dimensions for additional report domains without exposing arbitrary query or scope surfaces.
6. Continue executive analytics only where metric ownership and source-domain semantics are explicitly defined; avoid client-side cross-domain recomputation.

## Security invariants

- Report permissions never exceed current source-domain permissions.
- Tenant/company/branch and ownership derive from authenticated context/trusted snapshots, never request scope overrides.
- Branch Performance never accepts a client-controlled branch scope override.
- No client-controlled SQL, Prisma selection or arbitrary report/dimension query surface is exposed.
- Sensitive customer data remains excluded without explicit field-level permission/audit controls.
- Payroll data remains behind `hr_sensitive.read`.
- Previous-period ranges are server-derived.
- Drill-down identities/dimensions are server-controlled and non-exportable.
- Finance reports exclude reversed collections/payments and preserve income/expense/cash/payable semantic distinctions.
- Storage keys and schedule-run idempotency keys are server-generated only.
- Stored job/schedule JSON is revalidated before execution and downloads revalidate current ownership/permissions.
