#!/usr/bin/env bash
set -Eeuo pipefail

: "${PRODUCTION_URL:?PRODUCTION_URL is required}"

for command in curl grep awk; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "error: $command is required" >&2
    exit 1
  }
done

BASE_URL="${PRODUCTION_URL%/}"
API_BASE_URL="${BASE_URL}/backend"
MAX_LATENCY_SECONDS="${PRODUCTION_MAX_LATENCY_SECONDS:-3}"

assert_200() {
  local url="$1"
  local result
  local status
  local duration

  result="$(curl --silent --show-error --max-time 15     --output /dev/null     --write-out '%{http_code} %{time_total}'     "$url")"
  status="${result%% *}"
  duration="${result##* }"

  if [[ "$status" != "200" ]]; then
    echo "error: $url returned HTTP $status; expected 200" >&2
    exit 1
  fi

  if awk -v duration="$duration" -v maximum="$MAX_LATENCY_SECONDS" 'BEGIN { exit !(duration > maximum) }'; then
    echo "error: $url latency ${duration}s exceeded ${MAX_LATENCY_SECONDS}s" >&2
    exit 1
  fi
}

assert_200 "${BASE_URL}/login"
assert_200 "${API_BASE_URL}/health/live"
assert_200 "${API_BASE_URL}/health/ready"
assert_200 "${API_BASE_URL}/health/release"

release_body="$(curl --silent --show-error --fail --max-time 15 "${API_BASE_URL}/health/release")"
release_sha="$(printf '%s\n' "$release_body" | sed -n 's/.*"releaseSha":"\([0-9a-f]\{40\}\)".*/\1/p')"

if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "error: production API did not expose a valid release SHA" >&2
  echo "$release_body" >&2
  exit 1
fi

if [[ -n "${EXPECTED_RELEASE_SHA:-}" && "$release_sha" != "$EXPECTED_RELEASE_SHA" ]]; then
  echo "error: production release $release_sha does not match expected $EXPECTED_RELEASE_SHA" >&2
  exit 1
fi

web_headers="$(curl --silent --show-error --fail --max-time 15 --dump-header - --output /dev/null "${BASE_URL}/login")"
if ! printf '%s\n' "$web_headers" | tr -d '\r' | grep -Fixq "X-Release-Sha: $release_sha"; then
  echo "error: Web release SHA does not match API release SHA $release_sha" >&2
  exit 1
fi

for header in content-security-policy strict-transport-security x-frame-options x-content-type-options referrer-policy; do
  if ! printf '%s\n' "$web_headers" | grep -Eiq "^$header:"; then
    echo "error: required production Web header is missing: $header" >&2
    exit 1
  fi
done

echo "Public production synthetic check succeeded for release $release_sha."
