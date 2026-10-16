# VALOO Staging Deployment

Last updated: 2026-09-23

Staging must run the **exact immutable API/Web image pair** that is intended for production. Do not rebuild source code on the staging or production host.

## Required artifacts

A candidate consists of:

- one full 40-character Git commit SHA
- `ghcr.io/kaanb-wiascode/beauty-api:<sha>`
- `ghcr.io/kaanb-wiascode/beauty-web:<sha>`
- OCI `org.opencontainers.image.revision=<sha>` labels on both images

The API and Web image tags must contain the same `RELEASE_SHA`.

## Host prerequisites

- Docker Engine + Docker Compose v2
- outbound access to GHCR
- private/reachable PostgreSQL
- private/reachable Redis
- private S3-compatible object storage
- TLS reverse proxy/load balancer
- secret-managed deployment environment variables

PostgreSQL and Redis must not be published directly to the public internet.

## Prepare environment

Use `infrastructure/staging.env.example` as a schema only. Store populated values outside Git.

Example operator flow:

```bash
set -a
source /secure/path/valoo-staging.env
set +a

export DEPLOY_ENV=staging
export COMPOSE_FILE=infrastructure/docker-compose.staging.yml
export API_BASE_URL=https://staging.example.com/backend
export WEB_BASE_URL=https://staging.example.com
```

Validate before changing any running service:

```bash
bash scripts/release/verify-deployment-env.sh
docker compose -f "$COMPOSE_FILE" config --quiet
```

## Publish the exact candidate

Run the GitHub Actions workflow **Publish release images** with the full candidate SHA.

The workflow publishes:

```text
ghcr.io/kaanb-wiascode/beauty-api:<release_sha>
ghcr.io/kaanb-wiascode/beauty-web:<release_sha>
```

Both images include SBOM/provenance output from BuildKit and an OCI revision label.

## Deploy staging

```bash
bash scripts/release/deploy-compose-release.sh
```

The deploy script performs, in order:

1. deployment environment preflight
2. compose manifest validation
3. immutable image pull
4. `prisma migrate deploy`
5. API/Web startup without local rebuild
6. readiness wait
7. running image revision-label verification
8. API health verification
9. production runtime/security-header smoke verification
10. non-secret deployment manifest creation

A failed health/smoke gate exits non-zero and prints service status/logs. Database migrations are not automatically reversed.

## Backup/restore drill

Before production promotion, execute a real backup and restore against production-equivalent PostgreSQL:

```bash
DATABASE_URL='postgresql://<source>' \
RESTORE_TEST_DATABASE_URL='postgresql://<disposable-restore-target>' \
bash scripts/release/verify-postgres-backup-restore.sh
```

Record the managed-provider snapshot/PITR identifier. Production deployment additionally requires:

```bash
export BACKUP_REFERENCE='<snapshot-or-backup-id>'
export BACKUP_RESTORE_VERIFIED=true
```

## Staging acceptance

Run all critical flows from `PRE-RELEASE-RUNBOOK.md`, including:

- login/MFA/refresh/logout
- branch switching
- non-owner RBAC denial
- tenant/company/branch isolation
- Customer -> Appointment -> Payment -> Refund
- Opportunity -> WON -> Sale -> Confirm -> Payment
- Procurement -> Receipt -> AP/Accounting
- Stock Transfer -> Receive
- Payroll -> Posting -> Settlement/Reversal
- Financial integration -> Reconciliation

Do not promote a different SHA after staging acceptance. Any code change creates a new candidate and restarts the relevant release gates.

## Rollback

Application rollback is intentionally blocked unless schema compatibility is explicitly confirmed:

```bash
export PREVIOUS_RELEASE_SHA='<40-char-sha>'
export PREVIOUS_API_IMAGE="ghcr.io/kaanb-wiascode/beauty-api:$PREVIOUS_RELEASE_SHA"
export PREVIOUS_WEB_IMAGE="ghcr.io/kaanb-wiascode/beauty-web:$PREVIOUS_RELEASE_SHA"
export SCHEMA_COMPATIBLE_ROLLBACK=true

bash scripts/release/rollback-compose-release.sh
```

If the previous application version is not compatible with the migrated schema, do **not** use application rollback. Follow the database recovery/forward-fix decision in `PRE-RELEASE-RUNBOOK.md`.
