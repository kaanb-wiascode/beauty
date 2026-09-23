#!/usr/bin/env bash
set -Eeuo pipefail

: "${STAGING_URL:?STAGING_URL is required}"

for command in curl grep; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "error: $command is required" >&2
    exit 1
  }
done

BASE_URL="${STAGING_URL%/}"
API_BASE_URL="${BASE_URL}/backend"

assert_200() {
  local url="$1"
  local status
  status="$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' "$url")"
  if [[ "$status" != "200" ]]; then
    echo "error: $url returned HTTP $status; expected 200" >&2
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
  echo "error: staging API did not expose a valid release SHA" >&2
  echo "$release_body" >&2
  exit 1
fi

web_headers="$(curl --silent --show-error --fail --max-time 15 --dump-header - --output /dev/null "${BASE_URL}/login")"
if ! printf '%s\n' "$web_headers" | grep -Eiq "^x-release-sha: *$release_sha\r?$"; then
  echo "error: Web release SHA does not match API release SHA $release_sha" >&2
  exit 1
fi

for header in content-security-policy strict-transport-security x-frame-options x-content-type-options referrer-policy; do
  if ! printf '%s\n' "$web_headers" | grep -Eiq "^$header:"; then
    echo "error: required staging Web header is missing: $header" >&2
    exit 1
  fi
done

echo "Public staging synthetic check succeeded for release $release_sha."
