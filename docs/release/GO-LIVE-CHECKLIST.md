# VALOO Go-Live Checklist

Last updated: 2026-09-23

This checklist is the final production-release gate for `kaanb-wiascode/beauty`.
A production release is **NO-GO** while any item marked **BLOCKER** is incomplete.

## 1. Repository release candidate

- [x] Active release work remains on `feature/core-commerce-foundation`.
- [x] Fresh PostgreSQL migration chain is CI validated with `prisma migrate deploy`.
- [x] API typecheck, unit, E2E and build are blocking quality gates.
- [x] Web lint, typecheck and production build are blocking quality gates.
- [x] Production API/Web runtime smoke is part of the quality workflow.
- [x] API and Web production container images are built in PR CI.
- [x] API and Web container images are blocked on fixable HIGH/CRITICAL OS/library vulnerabilities.
- [x] CodeQL, high/critical production dependency audit and secret history scan are configured.
- [x] All GitHub Actions workflow files are statically validated with pinned actionlint.
- [x] Commerce release-surface lint is a blocking quality gate.
- [x] Next.js is pinned to the patched 16.3.3 release after critical security audit findings.
- [x] Production secrets are excluded from source-controlled environment files.
- [x] Release backups, report exports, dump files and local release manifests are Git-ignored.
- [x] Staging and production compose manifests deploy immutable SHA-tagged images.
- [x] Deployment environment preflight and compose validation run in CI.
- [x] API/Web images carry the exact Git revision as OCI metadata.
- [x] GHCR publishing workflow produces SHA-tagged API/Web images.
- [x] Guarded deploy and schema-aware rollback helpers are present.
- [x] Coolify proxy-safe staging and production Compose manifests are present.
- [x] Staging promotion applies migrations before deployment and pins API/Web by SHA + digest.
- [x] Successful staging deployment emits an immutable release attestation artifact.
- [x] Production promotion consumes the staging attestation and refuses to rebuild the images.
- [x] Production promotion requires main ancestry, CI gates, backup confirmation, migrations and smoke verification.
- [x] Production promotion creates the immutable GitHub release/tag only after successful production verification.

## 2. Authentication and application security

- [x] Browser refresh token persistence has been removed.
- [x] Production refresh sessions use an HttpOnly, Secure, SameSite cookie.
- [x] Production refresh rejects body-only refresh tokens.
- [x] Authentication rate limiting fails closed in production if Redis protection is unavailable.
- [x] Production CORS configuration is mandatory and HTTPS-only.
- [x] Web CSP, HSTS, clickjacking, MIME-sniffing, referrer and permissions headers are configured.
- [x] API HSTS and no-store response caching are configured.
- [x] Private object storage is mandatory in production.
- [x] Report exports use object storage in production.
- [x] Report export worker must be explicitly enabled in production.

## 3. GitHub governance — BLOCKER

- [ ] **BLOCKER:** protect `main`.
- [ ] **BLOCKER:** require pull requests before merge.
- [ ] **BLOCKER:** require successful `Monorepo quality`.
- [ ] **BLOCKER:** require successful `Security checks`.
- [ ] **BLOCKER:** require successful production container build checks.
- [ ] **BLOCKER:** disable force pushes to `main`.
- [ ] **BLOCKER:** disable deletion of `main`.

These are repository administration settings and are not represented only by code in this branch.

The repository contains `.github/workflows/configure-main-protection.yml`, but the attempted enforcement run could not proceed because the required `REPO_ADMIN_TOKEN` secret is not configured. Do not mark this section complete until the repository setting itself is verified as protected.

## 4. Production infrastructure — BLOCKER

- [ ] **BLOCKER:** select production/staging hosting provider.
- [ ] **BLOCKER:** provision managed/private PostgreSQL.
- [ ] **BLOCKER:** provision managed/private Redis.
- [ ] **BLOCKER:** provision private S3-compatible object storage.
- [ ] **BLOCKER:** configure platform secret store.
- [ ] **BLOCKER:** configure TLS certificates and production DNS.
- [ ] **BLOCKER:** keep PostgreSQL and Redis off the public internet.
- [ ] **BLOCKER:** configure reverse proxy/load balancer health checks against `/health/ready`.
- [ ] **BLOCKER:** verify every Coolify deployment node can pull the immutable GHCR API/Web image digests (public package or authenticated private registry access).
- [ ] Configure WAF / edge rate limiting where supported.

Repository-side infrastructure preparation is complete:

- [x] production compose manifest
- [x] staging compose manifest
- [x] Coolify staging and production compose manifests
- [x] staging/production environment templates
- [x] deployment preflight validation
- [x] staging and production external-infrastructure preflight scripts/workflows
- [x] Coolify staging and production bootstrap helpers/workflows
- [x] immutable image identity verification
- [x] digest-pinned staging attestation
- [x] staging-attested production promotion workflow
- [x] release deployment manifest generation

Repository deployment reference:

```text
infrastructure/docker-compose.staging.yml
infrastructure/docker-compose.production.yml
infrastructure/docker-compose.coolify.staging.yml
infrastructure/docker-compose.coolify.production.yml
infrastructure/staging.env.example
infrastructure/production.env.example
apps/api/Dockerfile
apps/web/Dockerfile
scripts/release/deploy-compose-release.sh
scripts/release/rollback-compose-release.sh
docs/release/STAGING-DEPLOYMENT.md
docs/release/COOLIFY-PRODUCTION-SETUP.md
```

## 5. Backup and recovery — BLOCKER

Before the first production migration:

- [ ] **BLOCKER:** create a real staging/production-equivalent PostgreSQL backup.
- [ ] **BLOCKER:** restore that backup to a disposable database.
- [ ] **BLOCKER:** verify Prisma migration history after restore.
- [ ] **BLOCKER:** verify tenant/company/branch tables after restore.
- [ ] **BLOCKER:** record provider snapshot/PITR configuration.
- [ ] Define and approve RPO.
- [ ] Define and approve RTO.

Repository drill:

```bash
DATABASE_URL='postgresql://<source>' \
RESTORE_TEST_DATABASE_URL='postgresql://<disposable>' \
RESTORE_TEST_ACKNOWLEDGE_DISPOSABLE=true \
bash scripts/release/verify-postgres-backup-restore.sh
```

## 6. Staging validation — BLOCKER

Deploy the **exact candidate SHA** that will be promoted to production.

- [ ] **BLOCKER:** `/health/live` returns 200 behind the real proxy.
- [ ] **BLOCKER:** `/health/ready` returns 200 behind the real proxy.
- [ ] **BLOCKER:** production Web security headers are present.
- [ ] **BLOCKER:** login + MFA succeeds.
- [ ] **BLOCKER:** refresh rotation works through the HttpOnly cookie.
- [ ] **BLOCKER:** logout revokes the refresh session.
- [ ] **BLOCKER:** branch switching rotates the refresh session.
- [ ] **BLOCKER:** non-owner RBAC smoke tests pass.
- [ ] **BLOCKER:** cross-tenant/company/branch access is denied.
- [ ] **BLOCKER:** CRM Opportunity -> WON -> Sale -> Confirm -> Payment passes.
- [ ] **BLOCKER:** Customer -> Appointment -> Payment -> Refund passes.
- [ ] **BLOCKER:** Procurement -> Receipt -> AP/Accounting passes.
- [ ] **BLOCKER:** Inventory transfer/receive passes.
- [ ] **BLOCKER:** Payroll posting/settlement/reversal passes.
- [ ] **BLOCKER:** finance/reconciliation screens do not convert failed loads into authoritative zeroes.

## 7. Observability and incident readiness — BLOCKER

Repository baseline prepared:

- [x] Production synthetic monitor checks Web availability, API liveness/readiness, release identity, security headers and latency every 10 minutes once `PRODUCTION_URL` is configured.
- [x] Synthetic failures can be forwarded to `PRODUCTION_ALERT_WEBHOOK_URL`.

External operational controls still required:

- [ ] **BLOCKER:** central log aggregation is configured.
- [ ] **BLOCKER:** uptime monitoring is configured.
- [ ] **BLOCKER:** 5xx alert is configured.
- [ ] **BLOCKER:** API latency alert is configured.
- [ ] **BLOCKER:** PostgreSQL/Redis availability alert is configured.
- [ ] **BLOCKER:** backup failure alert is configured.
- [ ] **BLOCKER:** background worker/integration failure alert is configured.
- [ ] Document the production incident owner and escalation path.

All incident investigation must preserve request/correlation IDs and must never copy JWTs, passwords, API secrets or raw financial credentials into tickets/chat.

## 8. Release promotion

Repository automation is prepared in `.github/workflows/deploy-production-coolify.yml`.

Only after all blockers above are closed:

- [ ] Freeze the approved candidate SHA.
- [ ] Record database backup/snapshot identifier.
- [ ] Apply `prisma migrate deploy`.
- [ ] Deploy the exact API and Web digests attested by staging for the same SHA.
- [ ] Run `scripts/release/verify-api-health.sh`.
- [ ] Run production smoke journeys.
- [ ] Create the immutable production release/tag.
- [ ] Monitor error rate, latency and critical workers after traffic is enabled.

## Release decision

```text
Any BLOCKER incomplete -> NO-GO
All BLOCKER items complete -> eligible for explicit GO decision
```
