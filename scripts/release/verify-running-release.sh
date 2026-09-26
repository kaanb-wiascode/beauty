#!/usr/bin/env bash
set -Eeuo pipefail

: "${RELEASE_SHA:?RELEASE_SHA is required}"
COMPOSE_FILE="${COMPOSE_FILE:-infrastructure/docker-compose.staging.yml}"

command -v docker >/dev/null 2>&1 || { echo "error: docker is required" >&2; exit 1; }

check_service() {
  local service="$1"
  local container_id
  local revision

  container_id="$(docker compose -f "$COMPOSE_FILE" ps -q "$service")"
  if [[ -z "$container_id" ]]; then
    echo "error: service $service is not running" >&2
    exit 1
  fi

  revision="$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$container_id")"
  if [[ "$revision" != "$RELEASE_SHA" ]]; then
    echo "error: $service revision $revision does not match expected $RELEASE_SHA" >&2
    exit 1
  fi

  echo "ok: $service is running release $revision"
}

check_service api
check_service web

echo "Running containers match release $RELEASE_SHA."
