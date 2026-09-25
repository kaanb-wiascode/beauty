# VALOO — In-App Development Focus

Last updated: 2026-09-13

## Purpose

This document is the active planning entry point after completion of the current pre-release hardening phase.

The deployment/staging phase is intentionally parked. The application now returns to product development inside the CRM/ERP itself.

## Current branch

```text
feature/core-commerce-foundation
```

Do not merge or push to `main` unless an explicit release/merge decision is made.

## Frozen / parked work

The following work is not an active priority:

- staging/hosting deployment
- production rollout
- Supplier Network feature expansion
- Marketplace feature expansion
- new backend domains that are not required by an active product workflow

Existing shared Supplier/Marketplace code must remain stable, but feature expansion should not consume development capacity in this phase.

## Preserved release baseline

All application changes must preserve the release baseline recorded in `docs/state/PRE-RELEASE-CHECKPOINT.md`.

In particular, do not regress:

- tenant/company/branch isolation
- permission/RBAC enforcement
- Opportunity -> Sale idempotency
- accounting journal integrity
- payment/refund idempotency
- inventory/procurement accounting integrity
- payroll accounting/reversal integrity
- production environment validation
- health/readiness endpoints
- release shell validation
- financial UI rule: unknown/load failure must never be presented as authoritative zero/healthy data
- full Monorepo quality CI gate

## Active product-development priorities

The next development work should focus on application usability, operational completeness and connected CRM/ERP workflows.

### 1. CRM operational completeness

Prioritize:

- stronger Opportunity detail experience
- linked Sale visibility and navigation after conversion
- customer/opportunity context in one operational view
- follow-up workflow usability
- Customer -> Opportunity entry path where operationally useful
- CRM activity/timeline coherence
- pipeline filters, ownership and branch context UX

Do not rebuild the existing Opportunity -> Sale backend bridge.

### 2. Customer 360

Create a coherent customer workspace that can surface, permission permitting:

- identity/contact data
- appointments
- services
- sales
- packages/sessions
- payments/refunds
- customer ledger/current balance
- CRM leads/opportunities/follow-ups
- notes/events/timeline

Prefer composing existing backend capabilities before introducing new backend storage.

### 3. Sales and payments UX

Improve the user-facing lifecycle around:

```text
Draft Sale -> Confirm -> Payment / Installment -> Refund / Reversal -> Accounting visibility
```

Focus on:

- clear status presentation
- linked Opportunity/Customer visibility
- payment summary
- remaining balance
- installment visibility
- refund/reversal affordances with permission checks
- understandable accounting consequences without exposing internal implementation detail

### 4. Appointment and service workflow

Review the primary daily operational journey:

```text
Customer -> Appointment -> Service -> Payment -> Follow-up
```

Prioritize speed, clear error handling, branch/staff/service context and operational navigation.

### 5. Finance usability

Backend financial foundations are not the current expansion target.

Frontend/product work may improve:

- CFO readability
- reconciliation workflows
- payment and cash visibility
- customer ledger navigation
- drill-down from KPI -> source document
- explicit financial status and exception handling

Never replace unknown financial state with zero values.

### 6. Inventory and procurement usability

The backend lifecycle is already substantial. Focus on product-level usability:

- purchase request/order/receipt navigation
- stock movement traceability
- transfer status clarity
- low-stock operational actions
- source-document drill-down
- branch context clarity

Do not duplicate existing procurement services/endpoints.

### 7. HR and payroll usability

Focus on controlled operational UX around existing backend workflows:

- payroll period lifecycle
- employee/payment visibility
- liabilities
- reversal state
- permission-aware mutations
- clear posted/settled/reversed status

### 8. Global frontend quality

Continue standardizing:

- loading/error/empty/success states
- retry behavior
- stale-data preservation after refresh failure
- permission-aware action visibility
- responsive/mobile operation
- form double-submit protection
- destructive-action confirmation
- optimistic vs authoritative state boundaries
- navigation consistency

## Development rules

For every increment:

1. inspect the existing backend/frontend implementation before adding files or endpoints
2. reuse existing domain services where possible
3. preserve tenant/company/branch isolation
4. keep backend authorization authoritative
5. do not bypass financial/accounting lifecycle rules for UX convenience
6. keep mutations idempotent where duplicate submission is financially or operationally dangerous
7. add or extend E2E only for meaningful product/release invariants
8. run the complete Monorepo quality workflow after material changes
9. do not reopen Supplier Network/Marketplace/staging work unless explicitly requested

## Immediate planning order

Unless explicitly reprioritized, inspect and improve application areas in this order:

```text
CRM / Customer 360
    -> Sales / Payments
    -> Appointment daily workflow
    -> Finance drill-down UX
    -> Inventory / Procurement UX
    -> HR / Payroll UX
    -> Global navigation / responsive polish
```

The first implementation step of this phase should begin with a fresh audit of the current CRM and Customer screens against this document, then select the smallest high-impact connected workflow to improve.
