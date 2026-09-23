# VALOO — Pre-Release Checkpoint

Last updated: 2026-09-23

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

The **Staging & Production Infrastructure** phase is active.

Repository-side deployment preparation is now implemented on `feature/core-commerce-foundation`:

- immutable SHA-tagged API/Web container contract
- staging and production compose manifests
- deployment environment templates and preflight validation
- GHCR release-image publishing workflow
- running-container revision verification
- guarded migration/deploy helper
- schema-aware rollback helper
- non-secret release manifest generation
- staging deployment and GitHub governance runbooks

External infrastructure is not yet provisioned from this repository session. Production remains **NO-GO** until the managed services, DNS/TLS, branch protection, real backup/restore drill, staging acceptance and observability blockers in `docs/release/GO-LIVE-CHECKLIST.md` are closed.

## Candidate verification policy

Do not rely on a stale SHA recorded in documentation. The release candidate is the **exact current approved commit SHA** whose PR checks all complete successfully.

Required exact-SHA checks:

- Monorepo quality
- Security checks
- Production container build

Any commit after a successful run creates a new candidate and requires fresh checks.

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

The following release tooling is prepared:

- `docs/release/PRE-RELEASE-RUNBOOK.md`
- `docs/release/GO-LIVE-CHECKLIST.md`
- `docs/release/STAGING-DEPLOYMENT.md`
- `docs/release/GITHUB-GOVERNANCE.md`
- `scripts/release/verify-api-health.sh`
- `scripts/release/verify-production-runtime.sh`
- `scripts/release/verify-deployment-env.sh`
- `scripts/release/verify-running-release.sh`
- `scripts/release/verify-postgres-backup-restore.sh`
- `scripts/release/deploy-compose-release.sh`
- `scripts/release/rollback-compose-release.sh`

The repository tooling is CI-validated, but a real backup/restore and deployed staging health/golden-path run still require an external staging environment.

## External staging work remaining

1. select/provision the actual staging and production hosting/provider topology
2. provision private PostgreSQL, Redis and object storage
3. configure TLS, DNS, reverse proxy/load balancer and secret storage
4. protect `main` according to `docs/release/GITHUB-GOVERNANCE.md`
5. publish and deploy the exact approved candidate
6. run the real backup/restore recovery drill
7. verify `/health/live` and `/health/ready` behind the real proxy
8. run golden-path, RBAC and tenant-isolation acceptance tests
9. configure production observability and alerts
10. make the explicit production-release decision

## Active next phase

The active phase is **Staging & Production Infrastructure** until the external blockers above are closed.

Supplier Network and Marketplace expansion remain deferred unless they are required to fix a release blocker.
