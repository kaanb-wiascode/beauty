# Reporting & Analytics Development Roadmap

## 1. Purpose

This document is the canonical continuation guide for the Reporting & Analytics area of Beauty ERP.

The target is not a collection of static dashboard pages. The target is a reusable, secure and scalable Reporting & Analytics Platform where authorized users can:

- choose a report domain,
- apply detailed date and business filters,
- inspect summary and row-level data,
- drill down to source records,
- choose visible/exported columns,
- compare periods and branches,
- save reusable report definitions,
- export professionally formatted PDF, XLSX and CSV files,
- print reports,
- run large exports asynchronously,
- retain report/export history,
- eventually schedule recurring reports.

Repository: `kaanb-wiascode/beauty`

Development branch: `feature/core-commerce-foundation`

Do not merge or push to `main` unless explicitly requested.

---

## 2. Current State

The existing reporting frontend under `apps/web/app/(app)/reports` currently contains a useful but limited reporting foundation.

Observed areas include:

- General Reports dashboard
- Executive / ERP Management Report
- Staff Performance
- Service Performance
- Payment / Collection Reports
- Reports navigation and shared styling

### Current strengths

The current implementation already demonstrates several useful patterns:

- date-range filtering in staff, service and payment reports,
- presets such as Today / Yesterday / 7 / 30 / 90 days,
- summary KPI cards,
- staff and service ranking,
- row-level search on some reports,
- payment method breakdown,
- collection/refund summaries,
- cross-domain executive aggregation,
- permission checks at the reports area,
- direct links from executive reporting into operational modules.

The Executive Report is particularly important because it already combines data from CRM, accounting, accounts payable, inventory, staff, services and payments. It should be treated as an early prototype of cross-domain reporting rather than replaced blindly.

### Current limitations

The existing area is still primarily a set of prepared dashboards rather than a reporting platform.

Major gaps include:

- no general report-definition layer,
- no shared rich filter engine,
- no professional PDF generation engine,
- no XLSX export engine,
- no CSV export workflow,
- browser printing is not equivalent to report generation,
- no export jobs / queue for large datasets,
- no export history,
- no saved reports,
- no favorites,
- no scheduled reports,
- no reusable column chooser,
- no reusable grouping/pivot layer,
- limited drill-down,
- limited period comparison,
- limited branch comparison,
- insufficient customer reporting,
- insufficient sales/package reporting,
- incomplete finance/accounting reporting,
- incomplete inventory/procurement reporting,
- incomplete CRM/marketing reporting,
- incomplete HR/payroll/training/quality reporting,
- report-level permissions are not enough for sensitive cross-domain data,
- no field-level export policy for sensitive columns.

Approximate maturity at the time of this review:

| Area | Maturity |
|---|---:|
| Basic dashboards | 7/10 |
| Date filtering | 6/10 |
| Staff reporting | 6/10 |
| Service reporting | 6/10 |
| Payment reporting | 6/10 |
| Executive aggregation | 7/10 |
| Detailed filtering | 3/10 |
| Customer reporting | 1/10 |
| Sales reporting | 2/10 |
| Finance reporting | 4/10 |
| Inventory reporting | 3/10 |
| CRM reporting | 3/10 |
| HR reporting | 2/10 |
| Marketing reporting | 2/10 |
| Training reporting | 1/10 |
| PDF export | 1/10 |
| XLSX export | 0/10 |
| CSV export | 0/10 |
| Saved reports | 0/10 |
| Scheduled reports | 0/10 |
| Drill-down | 2/10 |
| Column customization | 0/10 |

Overall target-gap assessment: approximately 4/10 relative to the desired enterprise reporting platform.

---

## 3. Product Principle

Reports must evolve from **Report Pages** into a **Reporting Platform**.

The platform has three distinct responsibilities:

```text
ANALYZE
Inspect and compare data interactively

REPORT
Build a filtered, understandable business report

EXPORT
Produce PDF / XLSX / CSV / printable outputs
```

Reports must not become a second implementation of business logic. Source domains remain authoritative.

Target relationship:

```text
Reporting Platform
        |
        +-- Sales
        +-- Customers / CRM
        +-- Appointments
        +-- Services / Packages
        +-- Finance / Accounting
        +-- Inventory / Procurement
        +-- HR / Payroll
        +-- Academy / Development
        +-- Marketing / Communications
        +-- Quality
```

Reporting should consume domain-safe reporting/query services, not bypass domain rules with arbitrary client-driven SQL.

---

## 4. Target Reporting Architecture

Recommended conceptual architecture:

```text
                    REPORTING PLATFORM
                           |
        +------------------+------------------+
        |                  |                  |
   REPORT CATALOG      QUERY / FILTER       EXPORT
        |                  |                  |
 Definitions          Dimensions           PDF
 Categories           Metrics              XLSX
 Favorites            Filters              CSV
 Saved Reports        Sorting              Print
 Permissions          Grouping             Export Jobs
                      Comparison           History
                      Drill-down           Storage
                           |
                  DOMAIN REPORT SERVICES
                           |
 CRM / Sales / Finance / HR / Inventory / Appointments / etc.
```

Do not make all reports generic for the sake of genericity. Complex finance, payroll, accounting and domain-specific reports should retain dedicated domain services and accounting/business rules.

The generic layer should provide shared UX, orchestration, filtering metadata, export infrastructure, permissions and lifecycle behavior.

---

## 5. Report Catalog

The `/reports` root should become a report catalog / report center.

Suggested information architecture:

```text
REPORTS

Report Center
Favorites
Saved Reports
Report History

OPERATIONS
Appointments
Services
Packages
Staff

CUSTOMER & SALES
Customers
Sales
CRM
Marketing

FINANCE
Income & Expense
Collections
Payments
Receivables & Payables
Accounting
Profitability
Cash Flow

INVENTORY & PROCUREMENT
Products
Stock
Purchasing
Suppliers

HUMAN RESOURCES
HR
Payroll
Attendance & Leave
Performance

LEARNING & QUALITY
Training
Competency
Quality

MANAGEMENT
Branch Comparison
Executive Report
```

Navigation must remain permission-aware.

---

## 6. Report Definition Layer

Introduce a controlled `ReportDefinition` concept.

Candidate fields/concepts:

```text
key
name
category
description
dataSource / domain handler
availableDimensions
availableMetrics
availableFilters
availableColumns
defaultColumns
defaultSort
defaultGrouping
permissions
sensitiveFields
exportFormats
drillDownTargets
```

This does not mean storing arbitrary SQL.

A report definition should resolve to a known server-side report handler/service.

The client must never be able to send arbitrary SQL, arbitrary Prisma selection or unrestricted database field names.

---

## 7. Shared Filter Engine

Create a reusable report filter system instead of reimplementing filters on every report page.

Common dimensions should include, where relevant:

- date/date range,
- tenant scope (implicit, never user-overridable outside authorization),
- company/legal entity,
- branch,
- region,
- department,
- cost center,
- staff,
- customer,
- service,
- package,
- product,
- category/subcategory,
- status,
- payment method,
- channel,
- source,
- campaign,
- amount range,
- document state,
- accounting state,
- owner/assignee.

Only filters supported by the selected report definition should be displayed.

### Date presets

Target presets:

- Today
- Yesterday
- This Week
- Previous Week
- This Month
- Previous Month
- Last 7 Days
- Last 30 Days
- Last 90 Days
- This Quarter
- Previous Quarter
- This Year
- Previous Year
- Custom Range

### Comparison

Support, where semantically valid:

- previous equivalent period,
- same period previous year,
- custom comparison period.

Example:

```text
September 2026 vs August 2026
September 2026 vs September 2025
```

---

## 8. Column Selection

Users should be able to control report columns where the report permits it.

Example Customer Report:

```text
[x] Full Name
[x] Phone
[x] Email
[x] Branch
[x] First Visit
[x] Last Visit
[x] Total Spend
[x] Outstanding Balance
[ ] Birth Date
[ ] Acquisition Source
```

The system must distinguish:

- available columns,
- default columns,
- currently visible columns,
- exportable columns,
- sensitive columns,
- permission-protected columns.

A hidden or unauthorized field must not become accessible through export parameters.

---

## 9. Sorting, Grouping and Pivoting

Base capabilities:

- ascending/descending sorting,
- multi-column sorting where useful,
- group by branch,
- group by staff,
- group by service/product/category,
- group by day/week/month/quarter/year.

Later BI capability can support nested groupings such as:

```text
Branch
  -> Staff
      -> Service
```

Pivot-like behavior is a later phase and must not delay the reporting/export foundation.

---

## 10. Drill-down

Reports should support controlled drill-down into progressively more detailed views and ultimately into authoritative source records.

Example:

```text
Company
 -> Branch
    -> Staff
       -> Sale
          -> Transaction / Source Record
```

Examples:

- Revenue KPI -> branch breakdown -> staff -> sales -> Sale 360
- Customer segment -> customer -> Customer 360
- Product consumption -> product -> stock movement
- Expense total -> category -> expense -> Finance record

Drill-down routes must preserve permissions and tenant/company/branch boundaries.

---

## 11. Customer Reports

Target reports include:

- Customer List
- New Customers
- Active Customers
- Inactive Customers
- Lost Customers
- Recovered Customers
- Customer Spend
- Customer Visits
- RFM
- Customer Lifetime Value
- Customer Segments
- Birthday Report
- Demographic reports where legally and product-wise appropriate
- First Visit / Last Visit
- Visit Frequency
- Purchased Services
- Purchased Packages
- Product Purchases
- Total Sales
- Total Collections
- Outstanding Balance
- Refunds
- Acquisition Source
- Campaign Attribution

Example target query:

> Customers who spent more than 20,000 TRY in the last six months but have not visited for 60 days.

Customer exports require privacy-aware field controls and audit logging.

---

## 12. Sales Reports

Target reports:

- Sales Summary
- Sales Detail
- Daily Sales
- Monthly Sales
- Branch Sales
- Staff Sales
- Service Sales
- Package Sales
- Product Sales
- Discounts
- Cancellations
- Refunds
- Average Basket
- Basket Composition
- Cross-sell
- Upsell

Filters should support date, branch, staff, customer, service/package/product, category, status, source and amount where relevant.

---

## 13. Appointment Reports

Target reports:

- Total Appointments
- Completed
- Cancelled
- No-show
- Rescheduled
- Occupancy
- Capacity
- Staff Capacity
- Room/Bed/Device Capacity
- Hourly Demand
- Daily Demand
- Booking Lead Time
- Waiting Time
- New Customer Appointments
- Repeat Appointments
- Rebooking Rate

Longer-term capacity reporting should integrate with Workforce/HR and Appointment Resource Engine data.

---

## 14. Service Reports

Extend the existing service performance foundation.

Target metrics:

- sales,
- appointments,
- completed appointments,
- cancellations,
- no-shows,
- revenue,
- collected revenue,
- discounts,
- refunds,
- average price,
- average duration,
- direct cost,
- consumable cost,
- staff cost,
- commission,
- gross profit,
- margin,
- rebooking,
- customer rating,
- complaint rate.

Important distinction:

**Highest-selling service is not necessarily the most profitable service.**

---

## 15. Package Reports

Target reports:

- Packages Sold
- Active Packages
- Completed Packages
- Sessions Used
- Sessions Remaining
- Package Revenue
- Collections
- Outstanding Balance
- Unused Sessions
- Expired Sessions
- Deferred Revenue
- Recognized Revenue
- Package Breakage

Package accounting must follow the accounting/finance roadmap and must not invent recognition rules inside the reporting module.

---

## 16. Finance Reports

As the Finance roadmap is implemented, reporting should expose:

- Income
- Expenses
- Income vs Expense
- Cash Flow
- Collections
- Payments
- Refunds
- Cash Registers
- Bank Accounts
- POS
- Corporate Cards
- Receivables
- Payables
- Due Calendar
- Aging
- Budget vs Actual
- Branch P&L
- Cost Center P&L
- Taxes
- Legal Obligations
- Recurring Payments
- Employee Expenses
- Advances

Always preserve:

```text
Revenue != Collection
Expense != Payment
```

Financial reports must use authoritative Finance/Accounting services and accounting periods/mappings.

---

## 17. Inventory & Product Reports

Target reports:

- Stock Position
- Stock Movements
- Warehouse Stock
- Branch Stock
- Critical Stock
- Out-of-Stock Products
- Excess Stock
- Expiration / Expiring Lots
- Lot Tracking
- Purchases
- Supplier Analysis
- Product Sales
- Product Consumption
- Service Consumable Consumption
- Inventory Cost
- Inventory Valuation
- COGS
- Waste
- Loss
- Stock Count Variance
- Transfers

A particularly valuable Beauty ERP report is **consumable usage per service** and its variance from expected consumption.

---

## 18. Staff Reports

Extend the existing staff performance report to include, as data becomes available:

- appointments,
- completed services,
- revenue,
- collected revenue,
- package sales,
- product sales,
- conversion,
- commission,
- bonus,
- customer rating,
- complaint rate,
- attendance,
- lateness,
- absence,
- overtime,
- training,
- competency,
- performance review metrics,
- payroll cost,
- employer cost,
- revenue per employee,
- profit contribution.

Sensitive HR/payroll fields require stronger permissions than general report access.

---

## 19. CRM Reports

Target reports:

- Leads
- Lead Source
- Lead Owner
- Lead Status
- Pipeline
- Opportunities
- Weighted Pipeline
- Conversion
- Lost Reasons
- Stale Opportunities
- First Response Time
- SLA
- Lead -> Appointment
- Appointment -> Sale
- Source -> Revenue
- Campaign -> Revenue

Use the CRM roadmap as the source of truth for attribution and lifecycle definitions.

---

## 20. Marketing & Communications Reports

As the Marketing & Communications roadmap evolves:

- Campaign Performance
- Spend
- Impressions
- Clicks
- Leads
- CPL
- Appointments
- Sales
- CPA
- Attributed Revenue
- Collected Revenue
- ROAS
- Creator / Influencer ROI
- Agency Performance
- Content Performance

Attribution rules must be owned by the appropriate CRM/marketing domain and consumed by reports.

---

## 21. HR Reports

Target reports:

- Headcount
- New Hires
- Exits
- Turnover
- Attendance
- Absenteeism
- Overtime
- Leave
- Leave Balance
- Payroll
- Employer Cost
- Commission
- Bonus
- Employee Cost / Revenue
- Training
- Competency
- Certification
- Performance

Follow the HR roadmap for normalized employee data and security boundaries.

---

## 22. Learning / Development Reports

Target reports:

- Assigned Courses
- Course Completion Rate
- Pass Rate
- Failed Assessments
- Competency Gap
- Skill Matrix
- Certificate Expiry
- Mandatory Training Compliance
- Training Hours
- Training Cost
- Training Effectiveness

These reports should consume the Academy / Development module rather than duplicate learning state.

---

## 23. Quality Reports

Target reports:

- Customer Rating
- NPS / CSAT where implemented
- Complaints
- Complaint Categories
- Resolution Time
- Quality Findings
- Corrective Actions
- Branch Quality Score
- Staff Quality Score
- Service Quality Score
- Retraining Requirements

---

## 24. Branch Comparison

Multi-branch reporting is a first-class requirement.

Target comparison metrics can include:

- revenue,
- collections,
- appointments,
- conversion,
- average basket,
- payroll cost,
- operating expense,
- profit,
- customer rating,
- utilization,
- inventory efficiency.

Never compare branches using data outside the user's authorized branch/company scope.

---

## 25. Executive Reporting

The existing Executive Report should evolve into an Executive Report Pack.

Potential sections:

```text
Executive Summary
Finance
Sales
CRM
Customers
Operations
HR
Inventory
Marketing
Quality
```

Target output example:

```text
August 2026 Management Report.pdf
```

The executive report should support both interactive dashboard use and professional exported report packs.

---

## 26. PDF Export Engine

Browser printing is not sufficient as the primary PDF reporting solution.

A professional PDF report should support:

- company logo,
- company/legal entity name,
- report title,
- reporting period,
- active filters,
- generation timestamp,
- requesting/generated-by user where policy permits,
- page numbers,
- summary metrics,
- detailed tables,
- selected charts where appropriate,
- totals/subtotals,
- confidentiality label where appropriate,
- consistent typography and pagination.

PDF generation must happen server-side or through a controlled export worker so results are reproducible and auditable.

---

## 27. XLSX Export Engine

XLSX is a core product requirement, not an optional convenience.

Exports should be designed as real workbooks rather than raw table dumps.

Example workbook:

```text
Sheet 1 - Summary
Sheet 2 - Detail
Sheet 3 - Branch Breakdown
Sheet 4 - Staff Breakdown
Sheet 5 - Filters / Metadata
```

Not every report needs every sheet. The report definition/export adapter should determine workbook composition.

XLSX features may include:

- meaningful sheet names,
- header rows,
- frozen headers,
- numeric/date cell types,
- currency formatting,
- totals/subtotals,
- filters,
- column widths,
- report metadata,
- large-data-safe generation.

Do not expose unauthorized columns merely because they exist in the source data.

---

## 28. CSV Export

CSV should be supported for:

- large flat datasets,
- external analysis,
- data interchange,
- cases where workbook formatting is unnecessary.

CSV encoding and locale behavior must be predictable and tested, including Turkish characters.

---

## 29. Export UX

Suggested export menu:

```text
Export
- PDF
- Excel (.xlsx)
- CSV
- Print
```

Where relevant:

```text
[x] Visible columns only
[ ] All permitted columns
[x] Include summary
[x] Include charts
```

Options must be constrained by the report definition and permissions.

---

## 30. Export Job Architecture

Large reports must not be generated synchronously inside a normal request lifecycle.

Target flow:

```text
User
 -> Create Export Job
 -> Queue
 -> Worker
 -> Generate
 -> Store
 -> READY
```

Candidate states:

```text
QUEUED
PROCESSING
READY
FAILED
EXPIRED
```

Candidate `ReportExportJob` fields:

```text
id
tenantId
companyId
branchScope / scope snapshot
reportKey
requestedBy
format
filters
columns
sort
grouping
status
rowCount
file/storage reference
requestedAt
startedAt
completedAt
expiresAt
errorCode/errorSummary
```

Do not store secrets or excessive sensitive raw data in job metadata.

---

## 31. Report History

Users with appropriate permissions should be able to view relevant generated reports/exports.

Report history should expose:

- report,
- date/time,
- requester,
- format,
- status,
- row count,
- active filters summary,
- expiry/retention state.

Retention must be configurable and privacy-aware.

---

## 32. Saved Reports

Users should be able to save reusable report configurations.

Candidate model:

```text
SavedReport
- report definition
- name
- owner
- visibility
- filters
- columns
- sorting
- grouping
- comparison
- createdAt
- updatedAt
```

Example:

`Kadıköy Monthly Staff Performance`

Saved reports must not freeze authorization. Permissions must be re-evaluated every time the report is opened or exported.

---

## 33. Favorites and Recent Reports

Report Center should support:

- favorites,
- recent reports,
- recent exports,
- saved reports.

This is important because the report catalog will eventually contain many report types.

---

## 34. Scheduled Reports

Later phase:

Examples:

- Every Monday: previous week's branch performance
- First day of each month: previous month's finance management pack
- Daily: prior-day collections summary

A scheduled report definition should reference a saved/known report configuration and a controlled schedule.

Scheduling must not bypass current authorization and delivery policies.

Delivery mechanisms should reuse the platform's notification/communications infrastructure when implemented.

---

## 35. Charts and Visualization

Reports can expose controlled visualization modes where meaningful:

- table,
- bar,
- line,
- donut/pie sparingly,
- KPI cards.

Charts are not mandatory for every report.

The underlying dataset and metric definitions are more important than decorative visualization.

---

## 36. Permission Model

General `reports.read` is not sufficient for all reports.

Use layered authorization:

```text
Report permission
+
Underlying domain permission
+
Scope permission
+
Sensitive-field permission where applicable
```

Examples:

```text
reports.read + finance.read
reports.read + hr.read
reports.read + payroll-sensitive permission
```

A user who can access general reports must not automatically receive payroll, compensation, banking, identity or confidential customer data.

---

## 37. Tenant / Company / Branch Isolation

Every report query and export must preserve:

- tenant isolation,
- company/legal entity scope,
- branch scope,
- role scope,
- domain permission boundaries.

Client-supplied tenant/company/branch IDs must never override the authenticated scope.

Central roles may receive wider scope only when explicitly authorized by the existing tenancy/role model.

---

## 38. Sensitive Field Controls

Potential sensitive groups include:

### Customer

- phone,
- email,
- identity data,
- health/medical-related fields where applicable.

### HR

- salary,
- IBAN/banking,
- identity data,
- disciplinary data,
- sensitive personnel documents.

Introduce reusable field-level policies where necessary.

A field hidden in the UI due to authorization must also be unavailable through:

- export,
- saved report manipulation,
- API parameters,
- scheduled reports,
- drill-down.

---

## 39. Auditability

Important report/export events should be auditable.

Candidate events:

```text
REPORT_VIEWED
REPORT_EXPORTED
REPORT_EXPORT_FAILED
REPORT_SAVED
REPORT_UPDATED
REPORT_SCHEDULED
REPORT_DOWNLOADED
```

High-risk exports may use more explicit classifications such as:

```text
CUSTOMER_EXPORT
FINANCE_EXPORT
PAYROLL_EXPORT
HR_SENSITIVE_EXPORT
```

Audit metadata can include:

- tenant/company/branch scope,
- user,
- report key,
- filter summary/hash,
- exported column set/hash,
- row count,
- format,
- timestamp,
- export job ID.

Do not put secrets or unnecessary sensitive row data into audit logs.

---

## 40. Performance and Limits

Interactive previews and exports have different performance requirements.

Recommended principle:

```text
Interactive Preview -> bounded/paginated
Large Export -> asynchronous
```

Controls may include:

- maximum preview rows,
- pagination,
- server-side sorting/filtering,
- export row policies,
- rate limiting,
- export concurrency limits,
- storage retention,
- query timeout policies,
- indexes/materialized reporting structures only when justified by measured workload.

Do not load entire large datasets into the browser to filter them client-side.

---

## 41. Data Consistency

Report outputs must define what time/state they represent.

For finance/accounting, posted/draft/reversed semantics must be explicit.

For payments, refunds must not silently inflate collections.

For sales, cancellation/refund status must be respected.

For packages, revenue recognition must come from the authoritative finance/accounting rules.

For inventory, valuation must use the established inventory costing logic.

For HR/payroll, payroll status and reversals must be respected.

Reports must not calculate business definitions differently from source modules.

---

## 42. Recommended API Shape

Exact endpoint design should follow existing NestJS conventions after code inspection, but a conceptual API can include:

```text
GET  /reports/catalog
POST /reports/:reportKey/query
POST /reports/:reportKey/export
GET  /reports/exports
GET  /reports/exports/:id
GET  /reports/saved
POST /reports/saved
PATCH /reports/saved/:id
DELETE /reports/saved/:id
```

Do not implement these blindly if equivalent endpoints/services already exist.

The report query request can contain controlled values such as:

```text
filters
columns
sort
grouping
comparison
page
limit
```

All values must be validated against the server-owned report definition.

---

## 43. Testing Requirements

Every reporting increment should include relevant automated tests.

### Authorization tests

- tenant isolation,
- company isolation,
- branch isolation,
- role scope,
- report permission,
- underlying domain permission,
- sensitive field permission,
- export cannot bypass UI permissions.

### Query tests

- date boundaries,
- timezone behavior,
- filters,
- sorting,
- pagination,
- grouping,
- comparison,
- empty datasets,
- cancelled/refunded/reversed states.

### Export tests

- PDF generated successfully,
- XLSX workbook structure,
- CSV encoding,
- Turkish characters,
- numeric/date types,
- authorized columns only,
- filter metadata,
- large job lifecycle,
- failed job behavior,
- expiry/retention behavior.

### Financial integrity tests

- revenue vs collection,
- expense vs payment,
- refunds,
- reversals,
- accounting posting states,
- closed periods where relevant.

---

## 44. Development Phases

### Phase 1 - Reporting Foundation

Build the reusable reporting core:

- report catalog/definitions,
- shared filter engine,
- date presets,
- controlled dimensions/metrics,
- column selection,
- sorting,
- pagination,
- layered permissions,
- preview/query contract.

Then migrate/adapt existing Staff, Service and Payment reports incrementally without breaking their current behavior.

### Phase 2 - Export Engine

Implement:

- PDF,
- XLSX,
- CSV,
- Print,
- export job model,
- asynchronous processing,
- file/storage abstraction,
- report history,
- export audit events,
- retention/expiry.

### Phase 3 - Core Business Reports

Prioritize:

- Customers,
- Sales,
- Appointments,
- Services,
- Packages,
- Payments,
- Inventory.

### Phase 4 - Finance & Accounting Reports

As Finance roadmap domains become available:

- income,
- expense,
- cash flow,
- receivables/payables,
- aging,
- P&L,
- cost center,
- budget,
- bank/cash/card,
- accounting reports.

### Phase 5 - Cross-Domain Reports

Add:

- CRM,
- HR,
- Payroll,
- Marketing,
- Communications,
- Academy/Development,
- Quality.

### Phase 6 - Saved and Scheduled Reports

Implement:

- saved reports,
- favorites,
- recent reports,
- scheduled reports,
- reusable report configurations.

### Phase 7 - BI Capabilities

Implement selectively:

- group by,
- nested grouping,
- pivot-style summaries,
- drill-down,
- period comparison,
- branch comparison,
- richer charts.

### Phase 8 - Executive Reporting

Build professional report packs:

- Monthly Management Pack,
- Branch Performance Pack,
- Finance Pack,
- HR Pack,
- Marketing Pack,
- Executive Summary PDF/XLSX.

---

## 45. Suggested Phase 1 Implementation Order

Before changing code, inspect current reporting endpoints/services and schema again.

Recommended sequence:

1. Inventory all existing report endpoints and frontend report pages.
2. Identify duplicated date/filter/permission logic.
3. Define server-owned report keys and metadata types.
4. Create shared report filter/query DTOs without arbitrary query access.
5. Implement report catalog endpoint/service if no equivalent exists.
6. Implement shared frontend ReportFilterBar.
7. Implement shared column/sort state.
8. Adapt Staff Performance to the shared reporting foundation.
9. Adapt Service Performance.
10. Adapt Payment Report.
11. Add layered permission checks.
12. Add tests before beginning the export engine.

Avoid a large rewrite. Existing reports should remain functional throughout migration.

---

## 46. Definition of Done - Reporting Foundation

Phase 1 is not complete until:

- report definitions are server-controlled,
- the report catalog is permission-aware,
- common filters are reusable,
- date ranges are validated,
- tenant/company/branch scope cannot be escaped,
- report query parameters are allow-listed,
- sorting/pagination are server-side where needed,
- sensitive domains can require additional permissions,
- at least the existing Staff/Service/Payment reports use or interoperate cleanly with the new foundation,
- tests cover authorization and filters,
- existing report behavior is not regressed.

---

## 47. Definition of Done - Export Engine

Phase 2 is not complete until:

- PDF is a real generated report artifact, not only browser print,
- XLSX exports produce valid workbooks,
- CSV exports preserve Turkish text correctly,
- exports use the same filters and permissions as interactive reports,
- unauthorized columns cannot be exported,
- large exports are asynchronous,
- export jobs are tenant-scoped,
- export status/history is available,
- export actions are audited,
- generated files have retention/expiry behavior,
- failed exports do not leak internal errors or sensitive information,
- relevant automated tests pass.

---

## 48. Non-Negotiable Engineering Rules

- Work only on `feature/core-commerce-foundation` unless explicitly told otherwise.
- Do not merge/push to `main` without explicit instruction.
- Inspect current code before creating services, endpoints, migrations or models.
- Do not duplicate existing report/domain services.
- Preserve tenant/company/branch isolation.
- Preserve source-domain business rules.
- Preserve accounting and payroll integrity.
- Never allow arbitrary client SQL/query expressions.
- Re-check permissions during export generation.
- Do not expose sensitive data through exports or saved report manipulation.
- Keep large exports asynchronous.
- Make report generation auditable.
- Add tests with each logical increment.
- Update this roadmap when major architecture decisions or phases materially change.

---

## 49. Immediate Recommended Next Work

The next implementation task should be **Phase 1 - Reporting Foundation**, not adding dozens of isolated report pages.

First inspect:

- `apps/web/app/(app)/reports/**`
- existing staff/service/payment report endpoints,
- executive reporting data sources,
- permission helpers/guards,
- tenant context and branch scope,
- Prisma schema/migrations for any existing reporting/export entities,
- queue/storage infrastructure that could be reused later for exports.

Then implement the smallest safe shared reporting foundation and migrate one existing report as the first vertical slice.

---

## 50. New Chat Continuation Protocol

Use the following instruction when continuing Reporting development in a new chat:

```text
Open repository kaanb-wiascode/beauty and continue on branch feature/core-commerce-foundation.

First read /docs/REPORTING-DEVELOPMENT-ROADMAP.md.
Then inspect the current repository, existing reports frontend/backend, report-related endpoints, permission/tenant scope infrastructure, Prisma schema/migrations and the latest commits.
Compare the current implementation with the roadmap and identify the first incomplete Reporting item.
Do not recreate files, services, migrations, endpoints or models that already exist.
Preserve multi-tenant tenant/company/branch isolation, role/permission boundaries, sensitive-data controls, source-domain business rules, accounting/payroll integrity, idempotency where applicable, auditability and concurrency safety.
Do not allow arbitrary client-driven SQL or unrestricted database field queries.
Do not merge or push to main.
Marketplace and Supplier Marketplace are out of scope for now.
Implement the next incomplete Reporting roadmap item directly in the repository, add/update tests, run relevant CI-quality checks, commit changes and update the roadmap with progress.
```

---

## 51. Product Target

The final Reporting experience should allow an authorized user to:

> Select the business data they need, apply detailed date/company/branch/staff/customer/service/product/status/amount filters, analyze the results on screen, drill down into source records, choose columns, compare periods or branches, and export a professional PDF, Excel or CSV report. The user should also be able to save frequently used report configurations and, later, schedule recurring reports.

That is the target Reporting & Analytics Platform for Beauty ERP.
