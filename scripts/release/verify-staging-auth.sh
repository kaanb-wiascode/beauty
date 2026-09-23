#!/usr/bin/env bash
set -Eeuo pipefail

: "${API_BASE_URL:?API_BASE_URL is required}"
: "${STAGING_SMOKE_EMAIL:?STAGING_SMOKE_EMAIL is required}"
: "${STAGING_SMOKE_PASSWORD:?STAGING_SMOKE_PASSWORD is required}"

for command in curl jq; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "error: $command is required" >&2
    exit 1
  }
done

BASE_URL="${API_BASE_URL%/}"
COOKIE_JAR="$(mktemp)"
LOGIN_BODY="$(mktemp)"
trap 'rm -f "$COOKIE_JAR" "$LOGIN_BODY"' EXIT

json_post() {
  local path="$1"
  local body="$2"
  curl --silent --show-error --fail-with-body \
    --request POST \
    --header 'content-type: application/json' \
    --cookie "$COOKIE_JAR" \
    --cookie-jar "$COOKIE_JAR" \
    --data "$body" \
    "${BASE_URL}${path}"
}

login_payload="$(jq -nc \
  --arg email "$STAGING_SMOKE_EMAIL" \
  --arg password "$STAGING_SMOKE_PASSWORD" \
  '{email:$email,password:$password}')"

json_post "/auth/login" "$login_payload" >"$LOGIN_BODY"

if jq -e '.mfaRequired == true' "$LOGIN_BODY" >/dev/null 2>&1; then
  enrollment_required="$(jq -r '.enrollmentRequired // false' "$LOGIN_BODY")"
  if [[ "$enrollment_required" == "true" ]]; then
    echo "error: staging smoke account requires MFA enrollment; enroll it before release validation" >&2
    exit 1
  fi

  : "${STAGING_SMOKE_TOTP_SECRET:?STAGING_SMOKE_TOTP_SECRET is required because MFA is enabled}"

  command -v python3 >/dev/null 2>&1 || {
    echo "error: python3 is required to generate the staging TOTP code" >&2
    exit 1
  }

  challenge_id="$(jq -r '.challengeId // empty' "$LOGIN_BODY")"
  [[ -n "$challenge_id" ]] || {
    echo "error: MFA challengeId is missing" >&2
    exit 1
  }

  totp_code="$(python3 - <<'PY'
import base64
import hashlib
import hmac
import os
import struct
import time

secret = os.environ["STAGING_SMOKE_TOTP_SECRET"].replace(" ", "").upper()
padding = "=" * ((8 - len(secret) % 8) % 8)
key = base64.b32decode(secret + padding)
counter = int(time.time()) // 30
digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
offset = digest[-1] & 0x0F
value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
print(f"{value % 1_000_000:06d}")
PY
)"

  mfa_payload="$(jq -nc \
    --arg challengeId "$challenge_id" \
    --arg code "$totp_code" \
    '{challengeId:$challengeId,code:$code}')"

  auth_body="$(json_post "/auth/mfa/verify" "$mfa_payload")"
else
  auth_body="$(cat "$LOGIN_BODY")"
fi

access_token="$(jq -r '.accessToken // empty' <<<"$auth_body")"
[[ -n "$access_token" ]] || {
  echo "error: login did not return an access token" >&2
  echo "$auth_body" >&2
  exit 1
}

if jq -e 'has("refreshToken")' <<<"$auth_body" >/dev/null 2>&1; then
  echo "error: production login response exposed refreshToken in JSON" >&2
  exit 1
fi

if ! grep -Eq 'valoo_refresh_token' "$COOKIE_JAR"; then
  echo "error: login did not issue the HttpOnly refresh-session cookie" >&2
  exit 1
fi

curl --silent --show-error --fail-with-body \
  --header "authorization: Bearer $access_token" \
  "${BASE_URL}/auth/me" >/dev/null

curl --silent --show-error --fail-with-body \
  --header "authorization: Bearer $access_token" \
  "${BASE_URL}/auth/context/options" >/dev/null

refresh_body="$(json_post "/auth/refresh" '{}')"
rotated_access_token="$(jq -r '.accessToken // empty' <<<"$refresh_body")"
[[ -n "$rotated_access_token" ]] || {
  echo "error: refresh rotation did not return a new access token" >&2
  exit 1
}

if jq -e 'has("refreshToken")' <<<"$refresh_body" >/dev/null 2>&1; then
  echo "error: production refresh response exposed refreshToken in JSON" >&2
  exit 1
fi

curl --silent --show-error --fail-with-body \
  --header "authorization: Bearer $rotated_access_token" \
  "${BASE_URL}/auth/me" >/dev/null

json_post "/auth/logout" '{}' >/dev/null

post_logout_status="$(curl --silent --show-error \
  --request POST \
  --header 'content-type: application/json' \
  --cookie "$COOKIE_JAR" \
  --cookie-jar "$COOKIE_JAR" \
  --data '{}' \
  --output /dev/null \
  --write-out '%{http_code}' \
  "${BASE_URL}/auth/refresh")"

if [[ "$post_logout_status" != "401" ]]; then
  echo "error: refresh after logout returned HTTP $post_logout_status; expected 401" >&2
  exit 1
fi

echo "Authenticated staging smoke succeeded."
