#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -z "${API_BASE_URL:-}" ]]; then
  echo "error: API_BASE_URL is required (example: https://api-staging.example.com)" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "error: curl is required" >&2
  exit 1
fi

BASE_URL="${API_BASE_URL%/}"

check_endpoint() {
  local path="$1"
  local body_file
  local status

  body_file="$(mktemp)"

  if ! status="$(curl \
    --silent \
    --show-error \
    --location \
    --connect-timeout "${CONNECT_TIMEOUT_SECONDS:-5}" \
    --max-time "${MAX_TIME_SECONDS:-15}" \
    --output "$body_file" \
    --write-out '%{http_code}' \
    "${BASE_URL}${path}")"; then
    echo "error: request to ${path} failed" >&2
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    return 1
  fi

  if [[ "$status" != "200" ]]; then
    echo "error: ${path} returned HTTP ${status}" >&2
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    return 1
  fi

  rm -f "$body_file"
  echo "ok: ${path} returned HTTP 200"
}

check_endpoint /health/live
check_endpoint /health/ready

echo "API health verification succeeded for ${BASE_URL}."
