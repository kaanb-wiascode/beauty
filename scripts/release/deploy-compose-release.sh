#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_ENV="${DEPLOY_ENV:-staging}"
case "$DEPLOY_ENV" in
  staging) COMPOSE_FILE="${COMPOSE_FILE:-infrastructure/docker-compose.staging.yml}" ;;
  production) COMPOSE_FILE="${COMPOSE_FILE:-infrastructure/docker-compose.production.yml}" ;;
  *) echo "error: DEPLOY_ENV must be staging or production" >&2; exit 1 ;;
esac

: "${API_BASE_URL:?API_BASE_URL is required}"
: "${WEB_BASE_URL:?WEB_BASE_URL is required}"

if [[ "$DEPLOY_ENV" == "production" ]]; then
  : "${BACKUP_REFERENCE:?BACKUP_REFERENCE is required for production deploys}"
  if [[ "${BACKUP_RESTORE_VERIFIED:-false}" != "true" ]]; then
    echo "error: BACKUP_RESTORE_VERIFIED=true is required for production deploys" >&2
    exit 1
  fi
fi

for command in docker curl; do
  command -v "$command" >/dev/null 2>&1 || { echo "error: $command is required" >&2; exit 1; }
done

bash scripts/release/verify-deployment-env.sh
docker compose -f "$COMPOSE_FILE" config --quiet

echo "Pulling immutable images for $RELEASE_SHA..."
docker compose -f "$COMPOSE_FILE" pull api web

echo "Applying Prisma production migrations..."
docker compose -f "$COMPOSE_FILE" run --rm --no-deps api \
  sh -lc "cd /app/packages/database && /app/node_modules/.bin/prisma migrate deploy"

echo "Starting application services..."
docker compose -f "$COMPOSE_FILE" up -d --no-build --remove-orphans api web

echo "Waiting for API readiness..."
ready=false
for attempt in {1..40}; do
  if curl --silent --fail --max-time 5 "${API_BASE_URL%/}/health/ready" >/dev/null; then
    ready=true
    break
  fi
  sleep 3
done

if [[ "$ready" != "true" ]]; then
  echo "error: API did not become ready after deployment" >&2
  docker compose -f "$COMPOSE_FILE" ps >&2 || true
  docker compose -f "$COMPOSE_FILE" logs --tail=200 api web >&2 || true
  exit 1
fi

bash scripts/release/verify-running-release.sh
bash scripts/release/verify-api-health.sh
bash scripts/release/verify-production-runtime.sh
bash scripts/release/write-release-manifest.sh

echo "Release $RELEASE_SHA deployed successfully to $DEPLOY_ENV."
