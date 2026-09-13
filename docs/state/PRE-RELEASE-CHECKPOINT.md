# VALOO — Pre-Release Checkpoint

Last updated: 2026-09-13

This file supersedes older roadmap statements in `docs/state/CURRENT-STATE.md` where they conflict with the active branch.

## Release focus

Until the pre-release gate is complete:

- Supplier Network feature expansion is deferred.
- Marketplace feature expansion is deferred.
- New backend domains are deferred unless required to fix a release blocker.
- Work should prioritize production hardening, core CRM/ERP golden paths, operational frontend reliability, CI and deployment/recovery readiness.

## Production hardening completed

- production `CORS_ORIGINS` validation
- proxy-aware API bootstrap support
- graceful shutdown hooks
- baseline security headers
- request/correlation IDs
- structured request logging without request bodies or credentials
- `/health/live`
- `/health/ready` with dependency readiness semantics

## CRM -> ERP status

Opportunity -> Sale is no longer a future increment.

Implemented on the active branch:

```text
Lead
  -> Opportunity
  -> governed stage progression
  -> WON
  -> idempotent DRAFT Sale
  -> existing Sale confirmation
  -> Payment / Installment / Accounting flows
```

The conversion:

- is branch scoped
- requires existing sales/payment create permission
- uses serializable transaction handling
- locks the Opportunity before conversion
- permits only `WON` Opportunities
- creates at most one linked Sale
- stores a commercial snapshot
- appends a CRM audit event
- supports multiple service/package sale lines
- does not bypass normal Sale confirmation/accounting lifecycle

A dedicated API E2E golden-path test covers conversion, idempotency, confirmation and payment.

## Frontend financial reliability completed

The following critical screens distinguish unknown/load-failure state from authoritative zero/empty data:

- Inventory operational surfaces
- Procurement operational surfaces
- Quality cockpit
- CRM cockpit
- Marketplace preview (existing scope only)
- Finance Reconciliation Center
- CFO cockpit
- Financial Integrations
- Payroll Dashboard

The release rule is:

```text
initial load -> loading state
initial failure -> explicit unknown/error + retry
real empty result -> empty state
refresh/action failure after valid data -> retain prior valid data + error
```

Financial screens must never infer `0`, healthy, paid, reconciled, no-risk, or no-liability solely because an API request failed.

## Release validation

Use `docs/release/PRE-RELEASE-RUNBOOK.md` for the staging/pre-release procedure.

The exact candidate SHA must pass the complete `Monorepo quality` workflow, including fresh migrations, API unit/E2E/build and web lint/typecheck/build.

## Remaining P0 release work

1. Complete operational UX audit of Payments/Sales and remaining accounting/AP/payroll mutation screens.
2. Keep core golden-path E2E green and add only tests that protect a real release invariant.
3. Verify permission/RBAC denial paths for high-risk mutations.
4. Execute staging backup/restore verification and deployment smoke checklist.
5. Resolve any regression surfaced by the final candidate CI.

Do not reopen Supplier Network or Marketplace feature work until these gates are complete unless they cause a shared release regression.
