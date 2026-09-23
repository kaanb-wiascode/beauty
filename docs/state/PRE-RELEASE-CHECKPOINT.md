# VALOO — Pre-Release Checkpoint

Last updated: 2026-09-13

This file supersedes older roadmap statements in `docs/state/CURRENT-STATE.md` where they conflict with the active branch.

## Production Readiness Sprint — 2026-09-23

This section supersedes the older parked-staging decision below.

Repository production hardening has resumed on `feature/core-commerce-foundation`. The branch now includes:

- production HTTPS/CORS/object-storage/report-worker startup invariants
- HttpOnly/Secure refresh-session cookies with browser refresh-token storage removed
- production auth rate-limit fail-closed behavior
- Web CSP/HSTS and API transport/cache hardening
- production API/Web Dockerfiles and a production compose topology
- CodeQL, critical dependency audit and secret-history scanning
- production runtime smoke verification inside the main quality workflow
- PR container-image build validation
- executable `docs/release/GO-LIVE-CHECKLIST.md`

External staging is still not complete. The remaining release blockers are infrastructure and operational gates: GitHub `main` protection, managed PostgreSQL/Redis/object storage, TLS/DNS, a real backup/restore drill, staging golden-path/RBAC/isolation smoke tests, and production observability/alerting.

The release remains **NO-GO** until the blocker list in `docs/release/GO-LIVE-CHECKLIST.md` is closed.

## Current decision

The production/staging deployment phase is intentionally **parked** for now.

Until staging work is explicitly resumed:

- do not spend development time on hosting-provider-specific deployment work
- do not merge/push this work to `main`
- keep Supplier Network feature expansion deferred
- keep Marketplace feature expansion deferred
- keep new backend domains deferred unless required by an application-level blocker
- preserve the release hardening, migrations, E2E and RBAC gates already completed
- shift active development focus to in-application CRM/ERP product improvements, workflows, UX and operational completeness

The staging/release work is not cancelled. It is a paused gate that will resume from `docs/release/PRE-RELEASE-RUNBOOK.md` when a staging environment/provider is selected.

## Latest verified candidate

```text
e1fec7e9cd4f1b93877062859d412cda62d9224e
Monorepo quality #1370 — SUCCESS
Run ID: 34770787008
```

Verified on the exact candidate SHA:

- release shell script syntax validation
- frozen dependency installation
- Prisma schema validation
- all migrations applied to a fresh PostgreSQL database
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

The non-blocking commerce lint-debt reporting step still represents historical debt and is not considered resolved by this checkpoint.

## Production hardening completed

- production `CORS_ORIGINS` validation
- proxy-aware API bootstrap support
- graceful shutdown hooks
- baseline security headers
- request/correlation IDs
- structured request logging without request bodies or credentials
- `/health/live`
- `/health/ready` with dependency readiness semantics
- release health verification helper
- backup/restore verification helper with source/restore database separation guard
- release helper shell syntax validation in CI

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

The Core Business Flow E2E covers branchless denial, conversion, idempotency, confirmation, automatic accounting and payment-to-PAID behavior.

## Runtime blockers discovered and fixed by the release golden path

### VAT Sale trigger column mismatch

Historical VAT runtime triggers referenced `branches.company_id`, while the actual branch column is `"companyId"`.

A corrective migration repairs both Sale and SaleItem VAT snapshot functions. This regression was detectable only during a real Sale insert, not by migration-only validation.

### Prisma advisory-lock deserialization

Automatic accounting used transaction advisory locks through PostgreSQL `pg_advisory_xact_lock(...)`. PostgreSQL returns `void` and Prisma cannot deserialize that result.

The lock mechanism remains transaction-scoped and concurrency-safe, while the query now returns a supported integer projection after acquiring the lock.

## Frontend financial reliability completed

The following critical screens distinguish unknown/load-failure state from authoritative zero/empty data:

- Inventory operational surfaces
- Procurement operational surfaces
- Quality cockpit
- CRM cockpit
- Marketplace preview within the existing frozen scope
- Finance Reconciliation Center
- CFO cockpit
- Financial Integrations
- Payroll Dashboard
- Payments

Release behavior standard:

```text
initial load -> loading state
initial failure -> explicit unknown/error + retry
real empty result -> empty state
refresh/action failure after valid data -> retain prior valid data + error
```

Financial screens must never infer `0`, healthy, paid, reconciled, no-risk or no-liability solely because an API request failed.

## High-risk authorization status

High-risk mutation surfaces retain explicit backend permission guards and are covered by a read-only RBAC E2E suite.

Validated denial boundaries include:

- payment creation
- payment refund
- accounting account/journal mutations
- payroll lifecycle/payment/reversal mutations
- CRM Opportunity -> Sale conversion

Backend authorization remains authoritative; frontend permission checks are UX only.

## Release tooling prepared

The following release tooling is ready for the future staging phase:

- `docs/release/PRE-RELEASE-RUNBOOK.md`
- `scripts/release/verify-api-health.sh`
- `scripts/release/verify-backup-restore.sh`

These tools have been CI syntax-validated but the real backup/restore and deployed health checks have **not** yet been executed against a staging environment.

## Parked staging work

When staging work is resumed, continue from this exact list rather than redesigning the deployment phase:

1. select the staging/hosting topology for API, Web, PostgreSQL and Redis
2. deploy the exact approved candidate with production-equivalent environment values
3. run the backup/restore recovery drill
4. verify `/health/live` and `/health/ready` behind the real load balancer/reverse proxy
5. run the release runbook golden-path smoke tests using a dedicated staging tenant
6. run non-owner RBAC smoke tests in staging
7. fix only regressions exposed by the deployed environment
8. make the explicit production-release decision

## Active next phase

The active development phase is now **In-Application CRM/ERP Product Development**.

Use `docs/state/IN-APP-DEVELOPMENT-FOCUS.md` as the current planning entry point.

Supplier Network, Marketplace expansion and staging/deployment work remain parked unless explicitly reactivated.
