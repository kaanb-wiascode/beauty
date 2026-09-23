#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_ENV="${DEPLOY_ENV:-staging}"
case "$DEPLOY_ENV" in
  staging) COMPOSE_FILE="${COMPOSE_FILE:-infrastructure/docker-compose.staging.yml}" ;;
  production) COMPOSE_FILE="${COMPOSE_FILE:-infrastructure/docker-compose.production.yml}" ;;
  *) echo "error: DEPLOY_ENV must be staging or production" >&2; exit 1 ;;
esac

: "${PREVIOUS_RELEASE_SHA:?PREVIOUS_RELEASE_SHA is required}"
: "${PREVIOUS_API_IMAGE:?PREVIOUS_API_IMAGE is required}"
: "${PREVIOUS_WEB_IMAGE:?PREVIOUS_WEB_IMAGE is required}"
: "${API_BASE_URL:?API_BASE_URL is required}"
: "${WEB_BASE_URL:?WEB_BASE_URL is required}"

if [[ "${SCHEMA_COMPATIBLE_ROLLBACK:-false}" != "true" ]]; then
  echo "error: rollback is blocked until SCHEMA_COMPATIBLE_ROLLBACK=true is explicitly confirmed" >&2
  echo "Database migrations are forward-only by default; restore from backup when schema compatibility is not guaranteed." >&2
  exit 1
fi

export RELEASE_SHA="$PREVIOUS_RELEASE_SHA"
export API_IMAGE="$PREVIOUS_API_IMAGE"
export WEB_IMAGE="$PREVIOUS_WEB_IMAGE"

bash scripts/release/verify-deployment-env.sh
docker compose -f "$COMPOSE_FILE" config --quiet
docker compose -f "$COMPOSE_FILE" pull api web
docker compose -f "$COMPOSE_FILE" up -d --no-build --remove-orphans api web

bash scripts/release/verify-api-health.sh
bash scripts/release/verify-production-runtime.sh

echo "Application rollback to $PREVIOUS_RELEASE_SHA completed successfully."
