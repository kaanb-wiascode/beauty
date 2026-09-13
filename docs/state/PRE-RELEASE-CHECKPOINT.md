# VALOO — Pre-Release Checkpoint

Last updated: 2026-09-13

This file supersedes older roadmap statements in `docs/state/CURRENT-STATE.md` where they conflict with the active branch.

## Release focus

Until the pre-release gate is complete:

- Supplier Network feature expansion is deferred.
- Marketplace feature expansion is deferred.
- New backend domains are deferred unless required to fix a release blocker.
- Work should prioritize production hardening, core CRM/ERP golden paths, operational frontend reliability, CI and deployment/recovery readiness.

## Latest verified candidate

```text
77f9891aecbd711c25e56bd9d718dda9faa85638
Monorepo quality #1363 — SUCCESS
Run ID: 34770038522
```

Verified on the exact candidate SHA:

- frozen dependency installation
- Prisma schema validation
- all 139 migrations applied to a fresh PostgreSQL database
- Prisma client generation
- database typecheck/build
- shared contracts typecheck/build
- API typecheck
- API unit tests
- API E2E tests
- API production build
- web lint
- web typecheck
- web production build

The non-blocking commerce lint-debt reporting step still reports historical debt and is not considered resolved by this checkpoint.

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
  -> automatic accounting journal
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

The main Core Business Flow E2E now covers branchless denial, conversion, idempotency, confirmation, automatic accounting and payment-to-PAID behavior without creating an additional registration that would weaken or bypass authentication rate limits.

## Runtime blockers discovered and fixed by the release golden path

### VAT Sale trigger column mismatch

Historical VAT runtime triggers referenced `branches.company_id`, while the actual branch column is `"companyId"`.

A corrective migration now repairs both Sale and SaleItem VAT snapshot functions. This regression was not detectable by migration-only smoke testing because the failure occurred only on a real Sale insert.

### Prisma advisory-lock deserialization

Automatic accounting used transaction advisory locks through:

```sql
SELECT pg_advisory_xact_lock(...)
```

PostgreSQL returns `void` from this function and Prisma cannot deserialize that result. The lock mechanism remains transaction-scoped, but the query now returns a supported integer projection after acquiring the lock. This protects automatic account creation and automatic journal idempotency without weakening concurrency controls.

The final E2E checkpoint verifies that Sale confirmation and Sale payment now cross this accounting path successfully.

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
- Payments

The release rule is:

```text
initial load -> loading state
initial failure -> explicit unknown/error + retry
real empty result -> empty state
refresh/action failure after valid data -> retain prior valid data + error
```

Financial screens must never infer `0`, healthy, paid, reconciled, no-risk, or no-liability solely because an API request failed.

## High-risk authorization audit

Release-critical mutation surfaces inspected so far retain explicit permission guards:

- payment creation: `payments.create`
- payment refund: `payments.refund`
- accounting mutations: `accounting.manage`
- payroll lifecycle/payment/reversal mutations: `hr.manage`
- CRM Opportunity -> Sale uses the existing sales/payment-create authorization boundary

Backend authorization remains authoritative; frontend permission checks are UX only.

## Release validation

Use `docs/release/PRE-RELEASE-RUNBOOK.md` for the staging/pre-release procedure.

The exact candidate SHA must pass the complete `Monorepo quality` workflow, including fresh migrations, API unit/E2E/build and web lint/typecheck/build.

## Remaining P0 release work

The codebase now has a green pre-release candidate. Remaining P0 work is operational rather than a new backend domain:

1. Run the candidate in the real staging environment with production-equivalent environment values.
2. Verify the actual staging database backup/PITR and perform a restore test or provider-approved recovery drill.
3. Execute the release runbook smoke tests against a dedicated staging/pilot tenant.
4. Verify load-balancer/readiness behavior with `/health/live` and `/health/ready` in the deployed environment.
5. Verify high-risk RBAC denial paths with non-owner test roles in staging, especially refunds, accounting management and payroll mutations.
6. Fix only regressions discovered by staging/pilot smoke; do not reopen deferred Supplier Network or Marketplace feature scope.

Do not reopen Supplier Network or Marketplace feature work until these gates are complete unless they cause a shared release regression.
