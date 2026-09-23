#!/usr/bin/env bash
set -Eeuo pipefail

: "${API_BASE_URL:?API_BASE_URL is required}"
: "${WEB_BASE_URL:?WEB_BASE_URL is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command '$1' is not installed" >&2
    exit 1
  fi
}

require_command curl
require_command grep

request_headers() {
  local url="$1"
  curl --silent --show-error --location --dump-header - --output /dev/null "$url"
}

assert_status() {
  local url="$1"
  local expected="$2"
  local status
  status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$url")"
  if [[ "$status" != "$expected" ]]; then
    echo "error: $url returned HTTP $status; expected $expected" >&2
    exit 1
  fi
}

assert_header() {
  local headers="$1"
  local header="$2"
  if ! printf '%s\n' "$headers" | grep -Eiq "^$header:"; then
    echo "error: required response header '$header' is missing" >&2
    exit 1
  fi
}

assert_status "${API_BASE_URL%/}/health/live" 200
assert_status "${API_BASE_URL%/}/health/ready" 200
assert_status "${API_BASE_URL%/}/health/release" 200
assert_status "${WEB_BASE_URL%/}/login" 200

release_body="$(curl --silent --show-error --fail "${API_BASE_URL%/}/health/release")"
if ! printf '%s\n' "$release_body" | grep -Fq "\"releaseSha\":\"$RELEASE_SHA\""; then
  echo "error: running API release identity does not match expected RELEASE_SHA=$RELEASE_SHA" >&2
  echo "$release_body" >&2
  exit 1
fi

refresh_status="$(
  curl --silent --show-error     --request POST     --header 'content-type: application/json'     --data '{}'     --output /dev/null     --write-out '%{http_code}'     "${API_BASE_URL%/}/auth/refresh"
)"
if [[ "$refresh_status" != "401" ]]; then
  echo "error: production refresh without HttpOnly cookie returned HTTP $refresh_status; expected 401" >&2
  exit 1
fi

web_headers="$(request_headers "${WEB_BASE_URL%/}/login")"
assert_header "$web_headers" "content-security-policy"
assert_header "$web_headers" "strict-transport-security"
assert_header "$web_headers" "x-frame-options"
assert_header "$web_headers" "x-content-type-options"
assert_header "$web_headers" "referrer-policy"

api_headers="$(request_headers "${API_BASE_URL%/}/health/live")"
assert_header "$api_headers" "strict-transport-security"
assert_header "$api_headers" "cache-control"
assert_header "$api_headers" "x-request-id"

echo "Production runtime smoke verification succeeded."
