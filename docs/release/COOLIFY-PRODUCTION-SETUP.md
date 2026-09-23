# VALOO Coolify Production Setup

Last updated: 2026-09-23

This document defines the production promotion contract. Production must promote the **same staging-attested image digests**; it must never rebuild the application during promotion.

## 1. GitHub production environment

Create a GitHub Environment named:

```text
production
```

Required secrets:

```text
COOLIFY_API_URL
COOLIFY_TOKEN
COOLIFY_PROJECT_UUID
COOLIFY_SERVER_UUID
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

Required repository/environment variable:

```text
PRODUCTION_URL=https://<production-hostname>
```

Optional variables:

```text
PRODUCTION_EXPECTED_RELEASE_SHA
PRODUCTION_MAX_LATENCY_SECONDS
COOLIFY_ENVIRONMENT_NAME
```

The repository governance workflow uses a separate repository secret:

```text
REPO_ADMIN_TOKEN
```

That token must be a fine-grained GitHub token scoped to this repository with Administration: write permission.

## 2. Bootstrap production application

After Coolify project/server access is configured, run:

```text
Bootstrap Coolify production application
```

The workflow creates a Docker Compose application using:

```text
infrastructure/docker-compose.coolify.production.yml
```

Store the returned UUID as:

```text
COOLIFY_PRODUCTION_APPLICATION_UUID
```

## 3. Production preflight

Before promotion, run:

```text
Production infrastructure preflight
```

It verifies:

- production DNS and TLS
- Coolify API/application access
- PostgreSQL connectivity
- Redis connectivity
- private object-storage bucket access

The database and Redis endpoints must remain private/restricted and must not be exposed as public application ports.

## 4. Staging acceptance is mandatory

Production promotion requires a successful **Deploy staging via Coolify** workflow for the exact release SHA.

The staging workflow:

1. verifies required CI/security/container checks
2. publishes SHA-tagged images
3. records API and Web OCI digests
4. runs `prisma migrate deploy` against staging
5. deploys `tag@sha256:digest` image references
6. verifies public health, release identity and security headers
7. verifies authenticated login/MFA/refresh/logout
8. uploads `staging-release-<sha>` attestation

Production consumes that attestation and does not rebuild the images.

## 5. Backup and recovery gate

Before production migration:

- create a managed PostgreSQL snapshot/PITR recovery point
- record its provider reference
- complete the logical backup/restore drill against a disposable database
- define/approve RPO and RTO

The production promotion workflow requires both a backup reference and explicit backup/restore confirmation before running migrations.

## 6. Main branch gate

The exact release SHA must already be an ancestor of `main` before production promotion.

Do not merge the feature branch merely to satisfy this rule. Merge only after the release review, staging acceptance and explicit merge decision.

Before merge, configure the required `main` protection described in:

```text
docs/release/GITHUB-GOVERNANCE.md
```

## 7. Promote production

Run:

```text
Promote production via Coolify
```

Required inputs:

- exact 40-character release SHA
- successful staging workflow run ID
- production HTTPS URL
- backup/snapshot/PITR reference
- explicit backup/restore confirmation
- unused stable SemVer tag such as `v1.0.0`

The workflow:

1. verifies the SHA belongs to `main`
2. verifies all release-critical GitHub checks
3. downloads and verifies the staging attestation
4. rechecks that staging still serves the approved SHA
5. verifies the digest-pinned GHCR images still exist
6. verifies production dependencies
7. applies `prisma migrate deploy` from the exact release checkout
8. points Coolify production at the staging-attested digests
9. deploys and waits for Coolify success
10. verifies production health, release identity and security headers
11. runs the production smoke account login/MFA/refresh/logout lifecycle
12. uploads a production release attestation
13. creates the immutable GitHub release/tag

If any step fails, the workflow must be treated as a failed production promotion.

## 8. Post-release monitoring

The `Production synthetic monitor` workflow runs every 10 minutes after `PRODUCTION_URL` is configured.

It checks:

- Web login availability
- API liveness
- API readiness (including PostgreSQL/Redis readiness semantics)
- API/Web release identity agreement
- optional expected release SHA
- key Web security headers
- response latency threshold

If `PRODUCTION_ALERT_WEBHOOK_URL` is configured, failures are posted to that webhook.

Synthetic monitoring is a baseline and does not replace centralized logs, APM/tracing, aggregate 5xx monitoring, database/provider telemetry or worker/integration alerts.
