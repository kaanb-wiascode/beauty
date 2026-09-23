# VALOO Pre-Release Runbook

This runbook defines the minimum gate for staging and pre-release deployment of the CRM/ERP core. Supplier Network and Marketplace enhancements are intentionally out of scope for this release gate.

## 1. Release scope

The pre-release candidate must preserve these invariants:

- tenant/company/branch isolation
- permission-aware mutations
- financial idempotency and auditability
- no internet-banking username/password collection
- no plaintext secret storage or response exposure
- explicit accounting/reconciliation truth
- clean fresh-database migration chain

Release-critical user journeys:

1. Customer -> Appointment -> Payment -> Refund
2. Lead -> Opportunity -> WON -> Sale -> Confirm -> Payment
3. Package -> Session -> Appointment
4. Purchase Request -> Approval -> PO -> Receipt -> AP/Accounting
5. Stock Transfer -> Receive
6. Payroll -> Posting -> Settlement/Reversal
7. Financial integration -> Reconciliation

## 2. Candidate branch and CI gate

Release candidates come only from:

```text
feature/core-commerce-foundation
```

Do not merge to `main` until the explicit release decision.

The GitHub `Monorepo quality` workflow must be fully green on the exact candidate SHA. At minimum it must pass:

- frozen workspace dependency installation
- release shell script syntax validation
- Prisma schema validation
- all migrations against a fresh PostgreSQL database
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

A cancelled/superseded run is not a release gate. Use the latest completed run for the exact candidate SHA.

The candidate must also pass:

- `Security checks` — CodeQL, critical production dependency audit and secret-history scan
- `Production container build` — API and Web image builds
- production runtime smoke inside `Monorepo quality`

GitHub `main` protection must require these checks before production merge.

## 3. Required production environment

The API startup validation must succeed before traffic is accepted.

Required production values include the repository's validated database, Redis and JWT settings plus:

```text
NODE_ENV=production
CORS_ORIGINS=https://<web-domain>
REPORT_EXPORT_STORAGE_DRIVER=object
REPORT_EXPORT_WORKER_ENABLED=true

OBJECT_STORAGE_BUCKET=<private-bucket>
OBJECT_STORAGE_REGION=<region>
OBJECT_STORAGE_ACCESS_KEY_ID=<secret-store-value>
OBJECT_STORAGE_SECRET_ACCESS_KEY=<secret-store-value>
```

`CORS_ORIGINS` must contain only explicitly approved HTTPS web origins. Do not use `*`.

When deployed behind a trusted reverse proxy/load balancer, configure the repository-supported proxy setting appropriately. Do not enable proxy trust blindly on an internet-facing process.

Secrets must be delivered through the deployment platform's secret store. Never commit `.env` production files.

Production startup rejects non-HTTPS CORS origins, incomplete private object storage, filesystem report exports and a disabled report-export worker.

The primary browser refresh session is cookie-backed. Production refresh tokens must not be persisted in browser local/session storage or accepted from the request body. The API issues the refresh session as an HttpOnly, Secure, SameSite cookie and rotates it on refresh/context changes.

## 4. Database backup before migration

Before every production/staging schema deployment:

1. create a database snapshot/backup
2. record the backup identifier in the deployment record
3. verify that restore credentials/access are available
4. do not continue if the backup cannot be verified

For managed PostgreSQL, prefer provider snapshot/PITR. If a logical backup is used, use the provider-approved `pg_dump` procedure and encrypt the resulting artifact.

A backup that has never been restore-tested does not count as a complete recovery plan.

The repository includes a logical backup/restore verification helper:

```bash
DATABASE_URL='postgresql://<source>' \
RESTORE_TEST_DATABASE_URL='postgresql://<disposable-restore-db>' \
bash scripts/release/verify-postgres-backup-restore.sh
```

Safety rules for this script:

- `DATABASE_URL` and `RESTORE_TEST_DATABASE_URL` must be different
- the restore target must be disposable because its `public` schema is dropped and recreated
- never point `RESTORE_TEST_DATABASE_URL` at production or a shared environment
- by default the local dump file is deleted after verification
- set `KEEP_BACKUP=1` only when the resulting dump is stored according to the organization's encryption/retention policy
- a successful run must restore Prisma migration history and query core tenant/company/branch tables

For managed PostgreSQL, this script supplements provider snapshot/PITR verification; it does not replace provider recovery procedures.

## 5. Migration deployment

From the repository root with production/staging `DATABASE_URL` supplied securely:

```bash
pnpm --filter @beauty-erp/database validate
pnpm --filter @beauty-erp/database migrate:deploy
pnpm --filter @beauty-erp/database generate
```

Rules:

- never run `prisma migrate dev` in staging/production
- never edit an already-applied production migration
- stop deployment if `migrate:deploy` fails
- do not start new application instances against a partially migrated database

## 6. Build and start

Production container references:

```text
apps/api/Dockerfile
apps/web/Dockerfile
infrastructure/docker-compose.production.yml
```

The compose file is an application-topology reference: PostgreSQL, Redis and object storage are expected to be externally managed/private services. Do not expose PostgreSQL or Redis directly to the public internet.


API verification commands:

```bash
pnpm --filter api typecheck
pnpm --filter api test:ci
pnpm --filter api test:e2e
pnpm --filter api build
pnpm --filter api start:prod
```

The web application must also pass its repository CI lint, typecheck and production build before deployment.

Use immutable build artifacts/images where supported. API and web deployments for one release should refer to the same candidate SHA.

## 7. Health checks

Two API health endpoints are release-critical:

```text
GET /health/live
GET /health/ready
```

Use `/health/live` only to determine whether the API process is alive.

Use `/health/ready` for load-balancer/readiness traffic gating. Readiness includes required dependencies such as PostgreSQL and Redis and must not receive production traffic while unhealthy.

After deployment run:

```bash
API_BASE_URL='https://<api-domain>' \
bash scripts/release/verify-api-health.sh
```

The CI production-runtime gate additionally runs:

```bash
API_BASE_URL='http://127.0.0.1:3000' \
WEB_BASE_URL='http://127.0.0.1:3001' \
bash scripts/release/verify-production-runtime.sh
```

This verifies API readiness, Web startup, required Web/API security headers and that a production refresh request without the HttpOnly cookie is rejected.

The command must succeed for both `/health/live` and `/health/ready` before traffic is considered healthy.

Also verify:

- PostgreSQL dependency is ready
- Redis dependency is ready
- application logs show no startup configuration errors

## 8. Post-deploy smoke tests

Perform with a dedicated staging/pilot tenant, never by mutating arbitrary production customer data.

### Authentication/context

- login succeeds
- branchless context cannot execute branch-required mutations
- branch switch succeeds
- revoked/unauthorized permission returns denial

### CRM -> Sale

- create Lead
- qualify to Opportunity
- progress Opportunity to `WON`
- create Sale from Opportunity
- repeat conversion and verify the same Sale is returned rather than a duplicate
- confirm Sale
- record payment
- verify payment summary becomes paid

### Customer operations

- create Customer
- create Service
- create Appointment
- record Payment
- refund Payment
- verify duplicate payment/refund protections

### Inventory/procurement

- verify branch-scoped inventory overview
- create/receive a controlled procurement record
- verify stock and accounting effects
- verify cross-branch access denial

### Payroll

- open payroll dashboard for a known test period
- confirm failed API loading never presents financial amounts as zero
- verify lifecycle status of a controlled payroll period

### Finance

- CFO cockpit loads
- reconciliation summary loads
- financial integrations view loads
- simulated load failure must display an unknown/error state, not healthy/zero financial values

## 9. Logging and incident correlation

API access logs must include the request correlation identifier and request metadata without logging secrets, tokens or request bodies containing credentials.

For a reported failure capture at least:

- timestamp
- request ID
- tenant/company/branch context where appropriate
- user ID where appropriate
- endpoint and HTTP status
- source document / sale / payment / journal identifiers when available

Never log JWT values, passwords, API secrets, bank credentials or raw card data.

## 10. Rollback decision

Application rollback is allowed only when the target application version is schema-compatible with the already-applied database migration.

Do not automatically roll back schema migrations by editing/deleting migration history.

If a migration causes data/schema failure:

1. stop new traffic/writes where necessary
2. preserve logs and candidate SHA
3. assess forward-fix versus database restore
4. if restore is required, restore from the verified pre-deploy snapshot/PITR point
5. redeploy the previously verified compatible application artifact
6. repeat health and smoke tests before reopening traffic

## 11. Release blocker policy

The following are release blockers:

- red migration, API E2E, typecheck or production build
- cross-tenant/company/branch data leakage
- permission bypass
- duplicate financial posting or duplicate Opportunity -> Sale creation
- failed payment/refund/accounting invariants
- readiness failure
- unverified database backup/recovery path
- financial screens showing unknown/unloaded values as authoritative zero/healthy values
- plaintext or exposed credentials/secrets

Supplier Network and Marketplace feature expansion is not a blocker for this pre-release unless a change in those modules breaks the shared release gate.

## 12. Final go-live decision

Use `docs/release/GO-LIVE-CHECKLIST.md` as the authoritative final blocker list. Any unchecked item marked **BLOCKER** keeps the release in NO-GO state.
