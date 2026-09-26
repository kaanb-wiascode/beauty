# VALOO — Coolify + Hetzner Staging

Last updated: 2026-09-23

This is the preferred staging path for the current release candidate flow.

## Target topology

```text
Internet
  |
  v
Hetzner Cloud Firewall
  |  TCP 80 / 443
  v
Coolify Proxy (Traefik)
  |
  v
VALOO Web :3001
  |
  |  internal Docker network /backend rewrite
  v
VALOO API :3000
  |
  +--> private PostgreSQL
  +--> private Redis
  +--> private S3-compatible object storage
```

Only the Web service should receive a public domain. The API remains private to the Compose network and is reached publicly only through the Web application's same-origin `/backend` rewrite.

Do not publish host ports 3000 or 3001 in the Coolify Compose definition.

## 1. Hetzner server boundary

Use a provider firewall in front of the server.

Normal public inbound rules after Coolify has a working HTTPS dashboard/domain:

- TCP 80 from the internet
- TCP 443 from the internet
- SSH only from approved administrator/Coolify source addresses

Do not expose:

- API port 3000
- Web container port 3001
- PostgreSQL 5432
- Redis 6379

When first installing self-hosted Coolify directly by server IP, Coolify may require TCP 8000, 6001 and 6002. Once the Coolify dashboard works through its HTTPS domain, close public access to those direct-dashboard ports.

Use a Hetzner private Network when separate application/database servers need private east-west communication.

## 2. Coolify application

Create a **Git repository / Docker Compose** application.

Repository:

```text
https://github.com/kaanb-wiascode/beauty
```

Current release branch:

```text
feature/core-commerce-foundation
```

Compose file:

```text
infrastructure/docker-compose.coolify.staging.yml
```

Keep **Raw Compose Deployment disabled**. Coolify should parse the Compose definition and add its normal networking/proxy management.

The Compose application already owns:

- API/Web image references
- internal service networking
- health checks
- runtime environment references
- API -> Web startup dependency

## 3. Public domain

Assign a public domain only to the `web` component.

Coolify domain configuration should route HTTPS to internal container port 3001, for example:

```text
https://staging.example.com:3001
```

The browser-facing URL remains:

```text
https://staging.example.com
```

Point DNS to the Hetzner server before requesting the certificate. Keep inbound 80/443 open so the integrated proxy can route traffic and issue/renew TLS certificates.

Do not assign a public API domain for the normal staging topology. Public API checks use:

```text
https://staging.example.com/backend
```

which the Web application forwards to `http://api:3000` on the private Compose network.

## 4. Persistent Coolify environment values

Configure these once in Coolify and keep them as runtime-only secrets where applicable:

```text
DATABASE_URL
REDIS_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET

OBJECT_STORAGE_BUCKET
OBJECT_STORAGE_REGION
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_ACCESS_KEY_ID
OBJECT_STORAGE_SECRET_ACCESS_KEY
OBJECT_STORAGE_FORCE_PATH_STYLE

REPORT_EXPORT_RETENTION_DAYS
REPORT_EXPORT_WORKER_POLL_MS
REPORT_EXPORT_WORKER_BATCH_SIZE
REPORT_EXPORT_EXPIRY_BATCH_SIZE
REPORT_EXPORT_STALE_PROCESSING_MINUTES
REPORT_EXPORT_STALE_BATCH_SIZE
REPORT_EXPORT_ACTIVE_JOB_LIMIT
REPORT_EXPORT_ROW_LIMIT
REPORT_SCHEDULE_BATCH_SIZE
```

The deployment workflow updates these release-specific values automatically:

```text
RELEASE_SHA
API_IMAGE
WEB_IMAGE
CORS_ORIGINS
PUBLIC_API_URL
```

Never store real production/staging credentials in repository files.

## 5. GHCR authentication

The staging server must be able to pull:

```text
ghcr.io/kaanb-wiascode/beauty-api:<release-sha>
ghcr.io/kaanb-wiascode/beauty-web:<release-sha>
```

If the GHCR packages are private, authenticate Docker on the deployment server as the same server user Coolify uses to execute Docker commands.

Use a GitHub credential/token with package-read access only as required. Do not put registry tokens in the Compose file.

## 6. GitHub staging environment

Create a GitHub Environment named:

```text
staging
```

Add these environment secrets:

```text
COOLIFY_API_URL
COOLIFY_TOKEN
COOLIFY_STAGING_APPLICATION_UUID
```

`COOLIFY_API_URL` must include the API base, for example:

```text
https://coolify.example.com/api/v1
```

The token should have only the Coolify permissions required to update the staging application's environment and trigger/read deployments.

Where supported, configure required reviewers on the GitHub `staging` Environment so deployment remains an explicit promotion action.

## 7. Automated staging promotion

Run:

```text
GitHub Actions -> Deploy staging via Coolify -> Run workflow
```

Inputs:

```text
release_sha = <approved full 40-character SHA>
staging_url = https://staging.example.com
```

The workflow refuses promotion unless the exact SHA already has successful:

- `quality`
- `Dependency audit`
- `Secret scan`
- `CodeQL`
- `Build API image`
- `Build Web image`

It then:

1. verifies the SHA belongs to `feature/core-commerce-foundation`
2. builds/publishes SHA-tagged API and Web images to GHCR
3. updates Coolify release-specific environment values
4. triggers the Coolify deployment
5. waits for a successful Coolify deployment state
6. verifies public `/health/live` and `/health/ready`
7. verifies `/health/release` reports the exact promoted SHA
8. verifies the Web security headers and refresh-cookie security behavior

Any mismatch between requested and running SHA fails the staging promotion.

## 8. Coolify proxy and health behavior

Use Coolify's normal integrated Traefik proxy path.

The Compose definition contains per-service Docker health checks, which is the supported health-check location for Docker Compose applications.

Do not expose a direct host port merely to make a health check work. Direct host port mappings bypass the Coolify HTTP proxy and also prevent the desired production-style network boundary.

## 9. Staging acceptance after automation

A successful automated deploy is not the final production GO decision.

After deployment, execute the release acceptance journeys in:

- `docs/release/PRE-RELEASE-RUNBOOK.md`
- `docs/release/GO-LIVE-CHECKLIST.md`

The real backup/restore drill, RBAC tests, tenant-isolation tests and critical financial/business golden paths remain release blockers until exercised against the deployed environment.
