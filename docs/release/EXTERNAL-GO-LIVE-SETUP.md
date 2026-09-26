# VALOO External Go-Live Setup

Last updated: 2026-09-23

Repository-side production hardening is complete. The remaining release blockers require external infrastructure credentials or repository-administration permissions and cannot be satisfied by application code alone.

## 1. Repository governance

Create this repository secret:

```text
REPO_ADMIN_TOKEN
```

Requirements:

- fine-grained GitHub token
- scoped only to `kaanb-wiascode/beauty`
- repository permission: **Administration: write**

Then run:

```text
Configure main protection
```

Expected result:

- pull requests required for `main`
- required status checks enforced
- branch must be up to date
- force pushes disabled
- branch deletion disabled
- admin enforcement enabled
- review conversations must be resolved

Do not continue to production while `main` reports `protected: false`.

## 2. GitHub staging environment

Create a GitHub Environment named:

```text
staging
```

Required environment/repository variable:

```text
STAGING_URL=https://<staging-hostname>
```

Required staging secrets:

```text
COOLIFY_API_URL
COOLIFY_TOKEN
COOLIFY_STAGING_APPLICATION_UUID

STAGING_DATABASE_URL
STAGING_REDIS_URL

STAGING_OBJECT_STORAGE_BUCKET
STAGING_OBJECT_STORAGE_REGION
STAGING_OBJECT_STORAGE_ENDPOINT
STAGING_OBJECT_STORAGE_ACCESS_KEY_ID
STAGING_OBJECT_STORAGE_SECRET_ACCESS_KEY

STAGING_SMOKE_EMAIL
STAGING_SMOKE_PASSWORD
STAGING_SMOKE_TOTP_SECRET

STAGING_RESTORE_TEST_DATABASE_URL
```

If the Coolify staging application does not exist yet, configure instead/additionally:

```text
COOLIFY_PROJECT_UUID
COOLIFY_SERVER_UUID
```

then run:

```text
Bootstrap Coolify staging application
```

Store its returned application UUID as `COOLIFY_STAGING_APPLICATION_UUID`.

## 3. Staging execution order

Run in this order:

1. `Staging infrastructure preflight`
2. `Deploy staging via Coolify`
3. `Staging backup restore drill`
4. confirm `Staging synthetic monitor` is succeeding on schedule

The staging deploy must use the exact approved release SHA.

A successful staging deploy must prove:

- exact SHA belongs to the release branch
- quality/security/container checks passed
- PostgreSQL/Redis/object storage connectivity works
- database migrations apply successfully
- exact SHA-tagged images are published
- Coolify deploy succeeds
- API liveness/readiness/release endpoints succeed
- Web/API release SHA matches
- security headers are present
- login/MFA/refresh/logout lifecycle succeeds
- RBAC and critical business acceptance suites pass
- staging attestation artifact is uploaded

## 4. Backup/recovery gate

The restore target must be a disposable database and must never be the source database.

The recovery workflow requires:

```text
STAGING_DATABASE_URL
STAGING_RESTORE_TEST_DATABASE_URL
```

The logical recovery drill must complete before production promotion.

Separately record the managed PostgreSQL provider snapshot/PITR recovery reference and define approved RPO/RTO.

## 5. GitHub production environment

Create a GitHub Environment named:

```text
production
```

Required production variable:

```text
PRODUCTION_URL=https://<production-hostname>
```

Required production secrets:

```text
COOLIFY_API_URL
COOLIFY_TOKEN
COOLIFY_PRODUCTION_APPLICATION_UUID

PRODUCTION_DATABASE_URL
PRODUCTION_REDIS_URL

PRODUCTION_OBJECT_STORAGE_BUCKET
PRODUCTION_OBJECT_STORAGE_REGION
PRODUCTION_OBJECT_STORAGE_ENDPOINT
PRODUCTION_OBJECT_STORAGE_ACCESS_KEY_ID
PRODUCTION_OBJECT_STORAGE_SECRET_ACCESS_KEY

PRODUCTION_SMOKE_EMAIL
PRODUCTION_SMOKE_PASSWORD
PRODUCTION_SMOKE_TOTP_SECRET
```

Optional alert secret:

```text
PRODUCTION_ALERT_WEBHOOK_URL
```

If the Coolify production application does not exist yet, configure:

```text
COOLIFY_PROJECT_UUID
COOLIFY_SERVER_UUID
```

then run:

```text
Bootstrap Coolify production application
```

## 6. Production promotion

Production promotion is allowed only after:

- `main` protection is active
- staging deploy succeeded for the exact release SHA
- staging attestation exists
- staging still serves the approved SHA
- backup/restore drill succeeded
- managed snapshot/PITR reference exists
- production infrastructure preflight succeeds
- central logging/APM/alerts have been configured
- release SHA has been intentionally merged into protected `main`

Then run:

```text
Promote production via Coolify
```

Required inputs:

- exact release SHA
- successful staging workflow run ID
- production HTTPS URL
- backup/snapshot/PITR reference
- explicit backup/restore confirmation
- unused stable SemVer release tag

The production workflow promotes the staging-attested image digests, applies migrations, validates production health/authentication and creates the immutable GitHub release only after successful verification.

## 7. Observability gate

Before enabling customer traffic, configure an external monitoring platform for:

- centralized application logs
- error tracking
- aggregate HTTP 5xx alerting
- API latency/p95 alerting
- PostgreSQL availability/capacity alerts
- Redis availability alerts
- background worker/integration failure alerts
- backup/PITR failure alerts
- uptime monitoring

The repository `Production synthetic monitor` is a baseline only and does not replace APM/log aggregation.

## 8. Current measured blockers

The latest automated external preflight confirmed these staging values are currently missing:

```text
STAGING_URL
COOLIFY_API_URL
COOLIFY_TOKEN
COOLIFY_STAGING_APPLICATION_UUID
STAGING_DATABASE_URL
STAGING_REDIS_URL
STAGING_OBJECT_STORAGE_BUCKET
STAGING_OBJECT_STORAGE_REGION
STAGING_OBJECT_STORAGE_ENDPOINT
STAGING_OBJECT_STORAGE_ACCESS_KEY_ID
STAGING_OBJECT_STORAGE_SECRET_ACCESS_KEY
```

The latest governance attempt confirmed:

```text
REPO_ADMIN_TOKEN
```

is not configured.

Until these external values are provisioned, the repository remains production **NO-GO** despite repository-side hardening being complete.
