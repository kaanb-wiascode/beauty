# Beauty ERP Finance Development Roadmap

## Purpose

This document is the canonical continuation guide for the Finance domain in `kaanb-wiascode/beauty`.

Use this document whenever development continues in a new chat, coding session, IDE, agent, or branch review. Before implementing anything, always compare this roadmap with the current repository state and recent commits. Do not assume that an item listed here is still missing.

The goal is to evolve the current Finance area from a set of accounting, accounts-payable, reconciliation, treasury and CFO capabilities into a complete vertical-SaaS finance platform that can represent, approve, pay, reconcile, account for and analyze every meaningful cash-flow and accounting event of a beauty, clinic, spa or wellness business.

Marketplace and Supplier Marketplace scope is explicitly not part of this roadmap. Existing supplier/AP functionality may be used when needed, but marketplace/supplier-platform expansion belongs to a later phase.

---

# 1. Current State Summary

The Finance domain is not empty. The repository already contains meaningful accounting and management-finance foundations.

Current strengths include:

- chart of accounts
- hierarchical accounts
- account types: asset, liability, equity, revenue, expense
- journal entries and journal lines
- draft/posting lifecycle
- journal balance validation
- tenant/company/branch isolation
- trial balance
- account ledger
- income summary
- automated accounting for confirmed sales
- automated accounting for customer payments
- automated accounting for refunds
- supplier bills
- partial/full supplier bill payments
- supplier bill cancellation/reversal flows
- accounts payable analytics
- bank/payment integrations
- reconciliation foundations
- cost center foundations
- budgeting
- cash-flow forecasting
- treasury risk
- working capital metrics
- cash runway
- CFO dashboard
- financial health / benchmark services

Representative current modules:

- `apps/api/src/modules/accounting`
- `apps/api/src/modules/accounts-payable`
- `apps/api/src/modules/financial-integrations`
- `apps/api/src/modules/profitability`
- `apps/api/src/modules/installments`
- `apps/api/src/modules/payments`
- `apps/api/src/modules/hr`
- `apps/web/app/(app)/finance`

The accounting engine already supports the important principle:

> business event -> accounting event

Examples already implemented include sale confirmation, sale payment, refund and supplier bill posting.

The major gap is not the general-ledger core. The largest gap is the operational finance layer that represents the real-life financial events of a company before and around accounting.

---

# 2. Main Problem Statement

Current Finance capabilities are unevenly distributed.

Approximate maturity:

- Operational Finance: 5/10
- Accounting Core: 7/10
- Treasury / Reconciliation: 7/10
- Management Finance / CFO: 8/10
- Billing / Invoicing: 4/10
- Employee Finance: 3/10
- Expense Management: 3/10
- Obligation Management: 3/10

The system can already calculate advanced financial indicators, but it does not yet provide a complete operational surface for the business events that should feed those indicators.

Typical examples that require first-class domain support:

- office and branch rent
- utilities
- legal and statutory payments
- tax obligations
- SGK / payroll-related liabilities
- bank fees
- card fees
- agency costs
- advertising spend
- subscriptions
- vehicle costs
- employee advances
- employee expense claims
- travel expenses
- per diem / harcırah
- out-of-city assignments
- manager expenses
- reimbursements
- corporate card spending
- deposits
- insurance
- maintenance
- loan and leasing installments
- litigation / enforcement / legal expenses
- miscellaneous external income
- refunds from suppliers
- interest income
- asset disposals
- capital injections

The target system must be able to answer:

> For every amount that entered, left, will enter or will leave the business, why did it happen, who owns it, which company/branch/cost center does it belong to, which document proves it, when is it due, who approved it, how was it paid, whether it was reconciled and what accounting effect did it create?

---

# 3. Finance Architecture Target

The Finance platform should be treated as three connected layers.

```text
FINANCE PLATFORM

1. OPERATIONAL FINANCE
   - income
   - expenses
   - obligations
   - invoices
   - bills
   - employee finance
   - travel & expense
   - cash
   - banks
   - cards
   - collections
   - payments

2. ACCOUNTING
   - chart of accounts
   - journals
   - posting
   - ledger
   - trial balance
   - period close
   - reversal
   - accounting policies
   - tax mappings

3. MANAGEMENT FINANCE
   - CFO dashboard
   - budgets
   - cash-flow forecast
   - profitability
   - cost centers
   - working capital
   - runway
   - alerts
   - financial health
```

No layer should bypass the others with one-off data structures unless there is a strong domain reason.

---

# 4. Core Design Principle: Revenue Is Not Collection, Expense Is Not Payment

This rule must remain explicit across the codebase.

```text
Revenue != Collection
Expense != Payment
```

Examples:

A 100,000 TRY invoice can create revenue and receivable while no money has yet been collected.

A supplier bill can create an expense and payable while no money has yet been paid.

Therefore the system must keep separate concepts for:

- commercial recognition
- accounting recognition
- receivable/payable
- cash movement
- reconciliation

Do not collapse these states into a single `paid` boolean or a single transaction table.

---

# 5. Target Operational Finance Domains

## 5.1 Income Management

Income must not be limited to `Sale`.

Add a first-class income domain for non-sale income.

Candidate income types:

- customer sale revenue
- rental income
- bank interest income
- exchange gain
- supplier refund
- insurance compensation
- government incentive/support
- deposit return
- employee repayment
- asset sale
- capital contribution
- other income

Suggested concepts:

- `IncomeRecord`
- `IncomeCategory`
- `IncomeSource`
- `IncomeDocument`
- `IncomeAccountingMapping`

Each income record should support:

- tenant
- company
- branch
- department
- cost/profit center
- project
- source type/id
- category/subcategory
- counterparty
- transaction date
- recognition date
- due date
- amount
- tax components
- currency
- FX rate
- document
- approval state
- collection state
- reconciliation state
- accounting state

## 5.2 Expense Management

Expense management should be a major Finance domain, not a simple amount/description table.

Minimum fields:

```text
Expense
- tenantId
- companyId
- branchId
- departmentId?
- costCenterId?
- projectId?
- employeeId?
- campaignId?
- categoryId
- subcategoryId?
- vendor/counterparty
- documentType
- documentNumber
- documentDate
- transactionDate
- dueDate?
- grossAmount
- netAmount
- taxAmount
- withholdingAmount
- currency
- exchangeRate
- paymentMethod?
- treasuryAccountId?
- corporateCardId?
- description
- attachment/document references
- approvalStatus
- paymentStatus
- reconciliationStatus
- accountingStatus
- sourceType/sourceId
```

Avoid creating a generic expense model that cannot support approvals, documents, obligations, payments or accounting.

## 5.3 Expense Taxonomy

Provide a strong default taxonomy but allow tenant customization.

Suggested initial categories:

### Personnel
- salary
- bonus
- commission
- advance
- meal
- transport
- private insurance
- uniform
- training
- accommodation
- taxi
- flight
- bus/train
- vehicle rental
- travel
- per diem
- representation

### Facility / Branch
- rent
- dues
- electricity
- water
- gas
- internet
- phone
- cleaning
- security
- maintenance
- repairs
- renovation
- furniture
- equipment

### Finance
- bank fee
- POS fee
- card fee
- loan interest
- card interest
- transfer fee
- FX loss

### Legal / Statutory
- VAT
- withholding tax
- SGK
- income tax
- corporate tax
- stamp duty
- municipal payments
- permit/license
- notary
- litigation
- enforcement
- legal counsel
- accountant

### Marketing
- Meta Ads
- Google Ads
- TikTok Ads
- influencer
- agency
- production
- print materials
- sponsorship

### Operations
- consumables
- device maintenance
- medical product
- cosmetic product
- hygiene
- uniforms
- hospitality
- cargo
- courier

### Administration
- consulting
- software
- subscriptions
- licenses
- travel
- representation
- meetings

Tenants must be able to add/edit/deactivate custom categories without breaking accounting mappings.

---

# 6. Financial Obligations

An obligation is not the same as a payment or an expense.

Create a reusable obligation domain for known future liabilities.

Examples:

- rent
- tax
- SGK
- loan installment
- leasing installment
- software subscription
- insurance premium
- maintenance contract
- utility bill
- recurring legal payment

Suggested lifecycle:

```text
DRAFT
-> SCHEDULED
-> DUE
-> APPROVAL_PENDING
-> APPROVED
-> READY_FOR_PAYMENT
-> PARTIALLY_PAID
-> PAID
-> RECONCILED
-> POSTED
```

Rejection, cancellation and overdue states/events must also be supported.

Suggested entity:

`FinancialObligation`

Fields should include recurrence/source, legal entity, branch, amount, due date, expected account mapping, counterparty, payment priority, attachments and source relation.

---

# 7. Recurring Financial Obligations

Build recurrence as a first-class engine rather than copying records manually.

Examples:

```text
Rent
Branch: Bakirkoy
Amount: 180,000 TRY
Due day: 5
Start: 2027-01-01
End: 2027-12-31
```

The recurrence engine should generate period obligations idempotently.

Suggested use cases:

- rent
- dues
- subscriptions
- software
- leasing
- insurance
- maintenance
- loan installments
- recurring legal payments
- recurring utilities where amount is fixed/estimated

Do not silently generate duplicate obligations after retries or scheduler restarts.

---

# 8. Payment Calendar

Create a finance operations calendar that shows:

- due today
- due this week
- due this month
- overdue
- approved and ready for payment
- waiting approval
- projected incoming cash
- projected outgoing cash

This screen must feed directly into treasury and 13-week cash-flow forecasting.

Payment calendar data should come from real obligations, AP, payroll, tax, travel, advances, loans and other domains, not from manually maintained duplicate schedules.

---

# 9. Employee Finance

Employee finance must become a dedicated subdomain connected to HR and Finance.

## 9.1 Employee Advances

An employee advance is not a normal expense.

Suggested lifecycle:

```text
REQUESTED
-> MANAGER_APPROVED
-> FINANCE_APPROVED
-> PAID
-> OUTSTANDING
-> SETTLED / PAYROLL_DEDUCTED / REPAID
-> CLOSED
```

Track:

- employee
- request date
- purpose
- amount
- currency
- approved amount
- payment source
- paid date
- settlement method
- outstanding balance
- payroll deductions
- linked expense claims
- documents
- approvers

Employee profile should show:

- total advances issued
- settled
- deducted
- repaid
- outstanding balance

## 9.2 Expense Claims

Employees must be able to submit expenses they paid personally.

Example:

```text
Expense Claim
Employee
Business Trip / Cost Center
Hotel   4,500
Taxi      900
Meal    1,200
Total   6,600
```

Required features:

- multiple expense lines
- receipt/document upload
- expense category
- tax details
- project/cost center
- manager approval
- finance approval
- rejection / return for correction
- reimbursement
- accounting posting

## 9.3 Travel & Expense

Create a business-trip domain for out-of-city assignments.

Fields:

- employee
- origin
- destination
- purpose
- start/end
- advance
- daily allowance
- hotel budget
- transport budget
- approver
- project/cost center

Settlement must calculate:

```text
Advance given
- approved expenses
= employee receivable/payable difference
```

The difference must be settled by repayment, reimbursement or payroll deduction.

---

# 10. Approval Engine

Finance requires configurable approval policies.

Do not hard-code approval logic inside every finance module.

Create or reuse a general approval engine that supports rules such as:

```text
0-5,000 TRY        Branch Manager
5,000-25,000 TRY   Regional Manager
25,000-100,000 TRY Finance Manager
100,000+ TRY       General Manager / Executive
```

Approval rules may depend on:

- amount
- category
- company
- branch
- cost center
- department
- employee
- payment type
- exceptional risk

Suggested state machine:

```text
DRAFT
-> SUBMITTED
-> IN_APPROVAL
-> APPROVED
-> READY_FOR_PAYMENT
-> PAID
-> POSTED
```

Also support:

- rejected
- returned for correction
- cancelled
- escalated
- delegated approver

Every decision must be auditable.

---

# 11. Billing and Invoicing

The current Sale model must not be treated as the invoice domain.

Create a provider-independent billing engine.

Suggested entities:

- `Invoice`
- `InvoiceLine`
- `InvoiceTaxLine`
- `InvoicePaymentAllocation`
- `CreditNote`
- `InvoiceDocument`

Required invoice fields:

- tenant/company/branch
- legal entity seller
- customer/buyer
- invoice number
- invoice date
- due date
- currency
- FX rate
- line items
- quantity
- unit price
- discounts
- tax base
- VAT/tax
- withholding/other tax data as needed
- gross/net totals
- notes
- status
- payment status
- accounting status
- external e-document status

Suggested lifecycle:

```text
DRAFT
-> APPROVED
-> ISSUED
-> SENT
-> PARTIALLY_PAID
-> PAID
```

Cancellation and credit-note flows must be explicit.

Invoice creation should be able to originate from:

- sale
- package sale
- manual billing
- other eligible commercial events

Do not integrate a specific e-invoice provider before the internal invoice domain is stable.

---

# 12. Tax Engine

Finance records must support tax components independently from totals.

Suggested capabilities:

- tax definitions
- tax rates
- effective dates
- company/legal-entity mappings
- item/service tax mapping
- VAT
- withholding
- exemptions
- inclusive/exclusive pricing
- tax rounding policy

The tax engine should feed invoice generation and accounting mappings.

Country-specific rules must be implemented through configurable policy/provider layers where possible.

For Turkey-specific e-Fatura/e-Arsiv/e-Belge requirements, always verify current legal and technical requirements from up-to-date official sources before implementation.

---

# 13. Treasury Model

## 13.1 Bank Accounts

Do not treat all bank money as a single `102 Bankalar` account operationally.

Create `TreasuryAccount` / `BankAccount` entities for real accounts.

Fields:

- company
- branch optional
- bank/provider
- account name
- IBAN / masked identifier
- currency
- current/available balance
- status
- accounting account mapping
- integration connection

Each real bank account should map to an accounting sub-account.

## 13.2 Cash Registers

Add operational cash-register entities.

Examples:

- Bakirkoy Main Cash
- Bakirkoy Staff Cash
- Kadikoy Main Cash
- HQ Cash

Supported operations:

- receipt
- payment
- cash to bank
- bank to cash
- cash-to-cash transfer
- opening balance
- closing balance
- cash count
- shortage
- excess

Every cash movement must be auditable and account-mapped.

## 13.3 Corporate Cards

Create corporate-card entities and assignment to employees/users.

Flow:

```text
Corporate Card
-> Bank/Card Transaction
-> Employee / Cost Center Assignment
-> Expense Matching
-> Receipt Requirement
-> Approval
-> Accounting
```

Unexplained card movements should remain in an exceptions queue.

---

# 14. Reconciliation

The existing financial-integration and reconciliation foundation should be expanded rather than rewritten.

Target bank transaction matching categories:

```text
Bank Transaction
-> Customer Payment
-> Supplier Payment
-> Expense Payment
-> Payroll Payment
-> Tax Payment
-> Employee Reimbursement
-> Advance
-> Transfer
-> Bank Fee
-> Other Income
-> Unknown
```

Unmatched items must become first-class reconciliation exceptions.

Suggested states:

- UNMATCHED
- SUGGESTED
- PARTIALLY_MATCHED
- MATCHED
- CONFIRMED
- REJECTED

Matching engine should support:

- amount
- date window
- reference
- counterparty
- IBAN
- invoice number
- payment reference
- expected obligation

Manual override must leave an audit trail.

---

# 15. Financial Dimensions

Finance must support reporting dimensions beyond branch.

Recommended dimensions:

- tenant
- company
- branch
- department
- cost center
- project
- employee
- campaign
- service line
- custom dimension in later phase

Not every dimension must become a direct column on every table. Define a consistent dimensional model that remains queryable and performant.

At minimum, every material operational finance record should be attributable to legal entity and branch, and when relevant to cost center/project/employee/campaign.

---

# 16. Cost Center Integration

Cost-center functionality already exists and must become central to transaction capture.

Examples:

```text
Expense: Meta Ads 100,000 TRY
Branch: Bakirkoy
Cost Center: Marketing
Campaign: Laser September
```

This enables:

- branch P&L
- department P&L
- campaign profitability
- service-line profitability
- manager accountability

---

# 17. Budget Control

Existing budgeting capabilities should be connected to transaction entry and approval.

When a transaction is submitted, the system should calculate:

- approved budget
- committed amount
- actual amount
- remaining budget
- new transaction impact

Example warning:

```text
Marketing Budget: 500,000
Committed/Actual: 470,000
New Expense: 75,000
Projected Overrun: 45,000
```

Support policies:

- warn only
- require additional approval
- hard block

---

# 18. Accounting Hardening

## 18.1 Accounting Periods

Create accounting periods.

Suggested states:

- OPEN
- SOFT_CLOSED
- CLOSED

Rules:

- posted historical records must not be mutated casually
- closed periods must reject new postings except controlled adjustment workflows
- reopen operations require elevated permission and audit

## 18.2 Reversal

Never delete or directly mutate posted accounting events to “fix” history.

Use:

```text
Original Journal
-> Reversal Journal
-> Corrected Journal
```

The existing `REVERSED` journal status can be extended for this model.

## 18.3 Accounting Mappings

Move automatic account selection away from hard-coded account codes over time.

Introduce company-level accounting policy/mapping configuration.

Examples:

- customer receivable account
- service revenue account
- package deferred revenue account
- cash account
- POS receivable account
- bank account mapping
- supplier payable account
- employee advance account
- employee payable account
- tax accounts
- bank-fee account
- depreciation accounts

Use sensible seeded defaults but allow controlled configuration.

---

# 19. Deferred Revenue and Package Accounting

Beauty businesses often sell packages before services are consumed.

Do not assume all package-sale value should always be recognized as immediate revenue.

Architecture should support accounting policy options such as:

```text
Package sale / collection
-> Cash / Receivable
-> Deferred Revenue Liability

Session consumption
-> Deferred Revenue
-> Service Revenue
```

Policy must be configurable and consistent with legal/accounting requirements.

Do not retrofit this by editing historical journal rows directly.

---

# 20. Fixed Assets

Create a fixed-asset domain for high-value equipment and assets.

Examples:

- laser devices
- treatment devices
- vehicles
- computers
- furniture
- HVAC

Fields:

- acquisition date
- acquisition cost
- supplier
- invoice/source
- company
- branch/location
- serial number
- useful life
- depreciation method
- residual value
- warranty
- current status

Support automated periodic depreciation posting.

---

# 21. Loans and Leasing

Create loan/leasing schedules for devices, vehicles or working-capital financing.

Fields:

- lender
- principal
- interest
- fees
- installment schedule
- due dates
- remaining principal
- linked asset
- treasury account

Accounting must distinguish:

- principal repayment
- interest expense
- fees

The payment calendar and cash-flow forecast must consume these schedules.

---

# 22. Deposits and Guarantees

Deposits, guarantees and prepayments must not be modeled as normal expense when economically incorrect.

Support:

- rent deposit
- supplier deposit
- customer deposit
- guarantees
- prepayments

These should map to asset/liability accounts according to policy and lifecycle.

---

# 23. Documents and Attachments

Every finance record must be able to reference documents.

Document types include:

- invoice
- receipt
- bank slip
- contract
- PDF
- image
- official notice
- tax document
- expense receipt

Documents should be linkable to:

- expense
- income
- obligation
- payment
- bill
- invoice
- employee claim
- travel
- advance
- reconciliation item

Document metadata and access must follow tenant/company authorization rules.

---

# 24. Financial Event Layer

Introduce a consistent financial-event abstraction so modules do not invent incompatible financial event formats.

Candidate events:

```text
SALE_CONFIRMED
PAYMENT_RECEIVED
PAYMENT_REFUNDED
INVOICE_ISSUED
EXPENSE_APPROVED
EXPENSE_RECOGNIZED
EXPENSE_PAID
OBLIGATION_CREATED
OBLIGATION_PAID
SUPPLIER_BILL_CREATED
SUPPLIER_PAYMENT_POSTED
EMPLOYEE_ADVANCE_PAID
EMPLOYEE_EXPENSE_APPROVED
EMPLOYEE_REIMBURSEMENT_PAID
PAYROLL_POSTED
TAX_OBLIGATION_CREATED
TAX_PAYMENT_POSTED
BANK_FEE_DETECTED
OTHER_INCOME_RECOGNIZED
```

Suggested common envelope:

```text
FinancialEvent
- id
- eventType
- tenantId
- companyId
- branchId?
- sourceType
- sourceId
- amount
- currency
- eventDate
- effectiveDate
- accountingStatus
- createdAt
```

The accounting engine can consume mapped events and create idempotent journals.

Do not create an event abstraction that hides domain-specific invariants. Domain models remain authoritative; the event layer connects them.

---

# 25. Finance UI Target Information Architecture

Current Finance menu is too narrow for the intended scope.

Recommended target navigation:

```text
FINANCE

Overview
Income
Expenses
Payments
Collections
Receivables
Payables
Invoices
Employee Expenses
Employee Advances
Travel & Per Diem
Recurring Payments
Legal / Statutory Obligations
Cash Registers
Bank Accounts
Corporate Cards
Reconciliation
Budget
Cash Flow
Profitability

ACCOUNTING

Accounting Overview
Journals
Chart of Accounts
Trial Balance
Account Ledgers
Accounting Periods
Tax / Accounting Settings
```

Do not expose every technical subdomain as a top-level menu item if UX becomes overwhelming. Group related operations into clear work centers.

---

# 26. Expense Operations UI

Target expense dashboard example:

```text
EXPENSES

This Month       2,481,450 TRY
Paid             1,904,000 TRY
Outstanding        577,450 TRY
Overdue              91,250 TRY
Waiting Approval      72,000 TRY
```

Table/filter dimensions should include:

- date
- category
- description
- company
- branch
- cost center
- counterparty
- amount
- due date
- approval state
- payment state
- accounting state

Users should be able to drill from an expense into:

- documents
- approval history
- payments
- reconciliation
- journal entry
- linked source

---

# 27. Income Operations UI

Income dashboard should distinguish:

- sale revenue
- other income
- recognized
- collected
- outstanding
- overdue

Each row should reveal source and accounting impact.

---

# 28. Payment Operations UI

Create a payment workbench with:

- due today
- overdue
- awaiting approval
- ready for payment
- scheduled
- paid
- failed
- reconciliation required

Batch-payment preparation may be added later, but permissions and approval separation must exist before automatic payment execution is considered.

Never collect or store internet-banking usernames/passwords.

---

# 29. Security and Financial Integrity Rules

Financial modules must preserve these principles:

- tenant isolation
- company/legal-entity isolation
- branch isolation where applicable
- authorization on every operation
- least privilege
- immutable audit trail for material financial actions
- idempotency for event-driven postings
- transaction-level consistency
- locking for concurrent financial mutations
- no plaintext credentials
- no internet-banking username/password collection
- explicit reversal instead of destructive edits to posted financial data
- sensitive fields masked in logs/responses
- durable reconciliation history

Reuse existing financial-integration credential vault / security patterns where appropriate.

---

# 30. Required Audit Events

At minimum, audit:

- income created/updated/cancelled
- expense created/submitted/approved/rejected/cancelled
- obligation generated/changed/paid
- payment created/reversed
- bank reconciliation override
- employee advance approval/payment/settlement
- employee claim approval/reimbursement
- invoice issue/cancel/credit note
- journal posting/reversal
- accounting period close/reopen
- accounting mapping changes
- tax-setting changes
- treasury account changes
- corporate-card assignment changes

Audit metadata should include actor, timestamp, tenant, company, branch, source, before/after where safe, and reason where required.

---

# 31. Reporting Targets

Operational finance must ultimately enable:

- branch P&L
- company P&L
- consolidated P&L
- expense by category
- expense by branch
- expense by cost center
- expense by employee
- expense by campaign
- income by source
- cash-in / cash-out
- overdue payables
- overdue receivables
- upcoming obligations
- recurring-cost trend
- personnel-cost trend
- marketing spend vs attributed revenue
- travel & expense trend
- statutory-payment calendar
- budget vs actual
- committed vs actual spend
- working capital
- DSO/DPO
- cash runway
- 13-week cash flow

Existing CFO services should be refactored to consume the new operational-finance sources instead of maintaining parallel assumptions.

---

# 32. Development Phases

## Phase 1 — Finance Transaction Foundation

Highest priority.

Deliver:

- generalized income records
- generalized expense records
- category/subcategory model
- company/branch scope
- cost-center dimension
- document links
- approval state
- payment state
- reconciliation state
- accounting state
- source references
- accounting mappings
- list/detail/create/update APIs
- Finance UI for income and expenses
- tests

Definition of done:

- a user can record a real business expense or external income
- the record is properly scoped
- it can carry evidence/document metadata
- it can move through controlled states
- it can generate accounting impact through policy, not hard-coded UI logic

## Phase 2 — Obligations & Recurring Finance

Deliver:

- financial obligations
- recurrence templates
- idempotent scheduler/materialization
- payment calendar
- overdue handling
- legal/statutory categories
- recurring rent/subscription/loan examples
- integration with cash-flow forecast

## Phase 3 — Employee Finance

Deliver:

- employee advances
- expense claims
- travel
- per diem
- reimbursement
- settlement
- payroll deduction link
- approval workflows
- employee finance balances

## Phase 4 — Billing

Deliver:

- invoice domain
- invoice lines
- taxes
- status lifecycle
- payment allocation
- credit notes
- PDF/document metadata
- Sale -> Invoice flow
- provider-independent e-document adapter interface

## Phase 5 — Treasury

Deliver:

- real bank-account entities
- cash registers
- transfers
- corporate cards
- bank/card transaction imports
- reconciliation workbench
- unmatched transaction queue

## Phase 6 — Accounting Hardening

Deliver:

- accounting periods
- close/reopen policy
- journal reversal
- configurable accounting mappings
- tax mappings
- deferred revenue policy for packages
- fixed assets
- depreciation
- loan/leasing accounting

## Phase 7 — Management Finance Integration

Refactor/expand:

- CFO dashboard
- cash-flow forecast
- budgeting
- financial health
- cost center analytics
- profitability
- working capital
- payment priorities
- alerts

All management-finance calculations must use trusted operational-finance/accounting sources.

---

# 33. Suggested Phase 1 Implementation Order

Do not start by adding many pages. Start with domain integrity.

Recommended order:

1. Inspect existing Prisma models, migrations and finance APIs.
2. Identify reusable entities and avoid duplicate tables.
3. Design expense/income taxonomy.
4. Design finance transaction/accounting state model.
5. Add migration(s) with tenant/company/branch indexes.
6. Add domain policy/services.
7. Add idempotent accounting integration.
8. Add authorization.
9. Add API DTO validation.
10. Add list/detail/create/update/cancel flows.
11. Add audit events.
12. Add web UI.
13. Add integration/unit tests.
14. Run typecheck/lint/test/build.
15. Update this roadmap with completed items and next step.

---

# 34. Implementation Rules

Before every implementation step:

1. Inspect current code.
2. Inspect recent commits.
3. Search for existing models/services/migrations/endpoints.
4. Never recreate something that already exists.
5. Preserve current architecture unless there is a documented reason to change it.
6. Keep changes incremental.
7. Preserve tenant/company/branch isolation.
8. Preserve financial idempotency, auditability, concurrency safety and accounting integrity.
9. Do not write to `main` unless explicitly requested.
10. Continue on `feature/core-commerce-foundation` unless repository strategy changes explicitly.
11. Do not introduce marketplace/supplier-platform scope into this roadmap.
12. Do not collect internet banking credentials.
13. Never expose secrets/API credentials in responses or logs.
14. Prefer configuration/policy over hard-coded account codes for new flows.
15. Do not delete posted financial history to correct data; use reversal/correction workflows.

---

# 35. Testing Requirements

Every finance feature must include the appropriate combination of:

- unit tests
- service tests
- API tests
- authorization tests
- tenant-isolation tests
- company-isolation tests
- branch-isolation tests
- idempotency tests
- concurrency tests
- decimal/rounding tests
- accounting-balance tests
- reversal tests
- approval tests
- invalid-state transition tests
- reconciliation tests

Important invariants:

- total debit == total credit for every posted journal
- duplicate source events do not create duplicate accounting entries
- one tenant/company cannot access another's financial data
- paid amount cannot exceed outstanding balance unless explicitly allowed by the domain
- closed-period posting is blocked
- reversal does not erase history
- currency/rounding behavior is deterministic
- approval requirements cannot be bypassed by alternate endpoints

---

# 36. Definition of Done for a Finance Feature

A Finance feature is not complete merely because its screen works.

It is complete only when applicable requirements are satisfied:

- domain model exists
- migration is safe
- API validation exists
- authorization exists
- tenant/company/branch isolation exists
- audit exists
- lifecycle transitions are enforced
- accounting impact is defined
- idempotency exists where events/retries are possible
- concurrency safety exists for money/state mutations
- UI supports normal operation and error states
- reporting impact is considered
- tests pass
- typecheck passes
- lint passes
- build passes
- docs are updated

---

# 37. Immediate Next Recommended Work

Unless repository inspection shows it has already been completed, begin with:

> Phase 1 — Finance Transaction Foundation

The first concrete objective should be to create a robust, reusable `Expense` / operational finance transaction foundation rather than a simplistic `amount + description` record.

The first implementation slice should cover:

- expense category and subcategory
- company/branch scope
- cost center
- counterparty
- amount/currency
- transaction date
- due date
- document metadata
- approval status
- payment status
- accounting status
- source type/id
- audit
- accounting mapping

Then add income records using the same platform conventions without incorrectly forcing all income through `Sale`.

---

# 38. Continuation Protocol for a New Chat

When continuing Finance work in another conversation, use this instruction:

```text
Open repository kaanb-wiascode/beauty and continue on branch feature/core-commerce-foundation.

First read /docs/FINANCE-DEVELOPMENT-ROADMAP.md.
Then inspect the current repository, finance-related modules, Prisma schema/migrations and the latest commits.
Compare the current implementation with the roadmap and identify the first incomplete Finance item.
Do not recreate files, services, migrations, endpoints or models that already exist.
Preserve multi-tenant tenant/company/branch isolation and financial idempotency, auditability, concurrency and accounting integrity.
Do not merge or push to main.
Marketplace and Supplier Marketplace are out of scope for now.
Implement the next incomplete Finance roadmap item directly in the repository, add/update tests, run the relevant CI-quality checks, commit the changes and update the roadmap with progress.
```

This document should be treated as a living roadmap. After each meaningful Finance milestone, update the completed items, newly discovered architectural constraints and the next recommended implementation step.
