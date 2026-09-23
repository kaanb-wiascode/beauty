# VALOO Coolify Staging Setup

Last updated: 2026-09-23

This document defines the staging contract for deploying VALOO through Coolify while preserving the exact approved release SHA.

## 1. Coolify application

Create one staging application using:

```text
infrastructure/docker-compose.coolify.staging.yml
```

The application must expose only the Web service publicly. The API remains reachable through the Web reverse-proxy path `/backend`.

Coolify or the upstream proxy must terminate TLS and route the staging hostname to the Web service.

## 2. GitHub staging environment

Create a GitHub Environment named:

```text
staging
```

Required secrets:

```text
COOLIFY_API_URL
COOLIFY_TOKEN
COOLIFY_PROJECT_UUID
COOLIFY_SERVER_UUID
COOLIFY_STAGING_APPLICATION_UUID

STAGING_DATABASE_URL
STAGING_RESTORE_TEST_DATABASE_URL
STAGING_REDIS_URL

STAGING_OBJECT_STORAGE_BUCKET
STAGING_OBJECT_STORAGE_REGION
STAGING_OBJECT_STORAGE_ENDPOINT
STAGING_OBJECT_STORAGE_ACCESS_KEY_ID
STAGING_OBJECT_STORAGE_SECRET_ACCESS_KEY

STAGING_SMOKE_EMAIL
STAGING_SMOKE_PASSWORD
STAGING_SMOKE_TOTP_SECRET

``

`COOLIFY_STAGING_APPLICATION_UUID` is produced by the **Bootstrap Coolify staging application** workflow after the project/server secrets are configured.

`STAGING_SMOKE_TOTP_SECRET` is required when the smoke account has MFA enabled. The smoke account should already be enrolled before release validation.

Optional secret:

```text
STAGING_ALERT_WEBHOOK_URL
```

Repository/environment variable:

```text
STAGING_URL=https://<staging-hostname>
```

The staging URL is intentionally a variable rather than a secret because it is a public origin.

## 3. Coolify runtime environment

The Coolify application must contain the production-equivalent runtime values required by:

```text
infrastructure/staging.env.example
```

At minimum configure:

- private PostgreSQL URL
- private Redis URL
- JWT access/refresh secrets
- S3-compatible private object storage
- object-storage credentials
- report export object-storage mode
- report worker enabled
- CORS/public API origins

The deployment workflow updates only release-specific values such as `RELEASE_SHA`, `API_IMAGE`, `WEB_IMAGE`, `CORS_ORIGINS` and `PUBLIC_API_URL`. Long-lived infrastructure secrets remain managed by Coolify/GitHub environment secrets.

## 4. Infrastructure preflight

Before the first deployment, run:

```text
Staging infrastructure preflight
```

It verifies Coolify application access, PostgreSQL connectivity, Redis connectivity, object-storage bucket access, DNS and TLS.

For a brand-new Coolify application, run **Bootstrap Coolify staging application** first and save the returned UUID as `COOLIFY_STAGING_APPLICATION_UUID`.

## 5. Deployment workflow

Run:

```text
Deploy staging via Coolify
```

Inputs:

- exact approved 40-character release SHA
- public HTTPS staging URL

The workflow:

1. validates the SHA and staging URL
2. verifies the SHA belongs to `feature/core-commerce-foundation`
3. verifies all required CI/security/container checks passed for that SHA
4. publishes SHA-tagged API/Web images
5. updates Coolify release environment variables
6. triggers the deployment
7. waits for Coolify success
8. checks API live/ready/release endpoints
9. verifies API and Web expose the expected release SHA
10. verifies production security headers
11. executes authenticated login/MFA/session/refresh/logout smoke tests

A failed gate fails the deployment workflow.

## 6. Synthetic monitoring

After staging is live, configure `STAGING_URL` in the GitHub staging environment/repository variables.

The `Staging synthetic monitor` workflow runs hourly and checks:

- Web login HTTP 200
- API liveness
- API readiness
- API release identity
- Web/API release identity match
- HSTS/CSP/frame/MIME/referrer headers

If `STAGING_ALERT_WEBHOOK_URL` is configured, synthetic failures are sent to that webhook.

## 7. Backup/restore drill

Create a disposable PostgreSQL database dedicated to restore verification.

Never point `STAGING_RESTORE_TEST_DATABASE_URL` at staging, production or any shared customer database.

Run:

```text
Staging backup restore drill
```

A successful workflow means:

- logical backup completed
- archive validation passed
- disposable target schema was recreated
- backup restored successfully
- Prisma migration history exists
- tenant/company/branch core tables can be queried

This drill complements the managed PostgreSQL provider's snapshot/PITR capability; it does not replace provider-level recovery.

## 8. Promotion rule

Production promotion is allowed only for the exact staging-accepted SHA.

Any commit after staging acceptance creates a new release candidate and requires fresh:

- quality checks
- security checks
- production container builds
- staging deploy
- authenticated smoke
- release identity verification

The repository remains NO-GO for production until all remaining external blockers in `docs/release/GO-LIVE-CHECKLIST.md` are closed.

## GHCR image pull access

The staging deployment promotes immutable `ghcr.io/...:sha@sha256:digest` image references. Repository access and container-registry access are separate.

Before the first staging deployment, choose and verify one of these supported modes:

- make the VALOO GHCR packages public; or
- authenticate Docker on every Coolify deployment server that must pull the private GHCR images.

For private GHCR packages, authenticate as the same server user Coolify uses for Docker:

```bash
echo "$GHCR_READ_TOKEN" | docker login ghcr.io --username '<github-user>' --password-stdin
```

Use a token limited to package-read access. Verify an exact digest pull on the deployment server before staging acceptance. Git repository credentials or a GitHub deploy key do not authenticate private GHCR image pulls.
