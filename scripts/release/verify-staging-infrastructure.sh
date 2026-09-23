#!/usr/bin/env bash
set -Eeuo pipefail

required=(
  STAGING_URL
  COOLIFY_API_URL
  COOLIFY_TOKEN
  COOLIFY_STAGING_APPLICATION_UUID
  STAGING_DATABASE_URL
  STAGING_REDIS_URL
  STAGING_OBJECT_STORAGE_BUCKET
  STAGING_OBJECT_STORAGE_REGION
  STAGING_OBJECT_STORAGE_ENDPOINT
  STAGING_OBJECT_STORAGE_ACCESS_KEY_ID
  STAGING_OBJECT_STORAGE_SECRET_ACCESS_KEY
)

fail() {
  echo "error: $*" >&2
  exit 1
}

missing=()
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "error: staging infrastructure configuration is incomplete" >&2
  echo "Missing values:" >&2
  for name in "${missing[@]}"; do
    echo "  - $name" >&2
  done
  exit 1
fi

for command in curl jq psql redis-cli python3 aws getent; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done

[[ "$STAGING_URL" =~ ^https://[^/]+$ ]] || fail "STAGING_URL must be an HTTPS origin without a path"
[[ "$COOLIFY_API_URL" == https://* ]] || fail "COOLIFY_API_URL must use HTTPS"
[[ "$STAGING_OBJECT_STORAGE_ENDPOINT" == https://* ]] || fail "STAGING_OBJECT_STORAGE_ENDPOINT must use HTTPS"

staging_host="$(python3 - <<'PY'
import os
from urllib.parse import urlparse
print(urlparse(os.environ["STAGING_URL"]).hostname or "")
PY
)"
[[ -n "$staging_host" ]] || fail "Unable to parse staging hostname"

if [[ "${STAGING_SKIP_PUBLIC_ENDPOINT:-false}" != "true" ]]; then
  echo "Checking DNS resolution for $staging_host..."
  getent ahosts "$staging_host" >/dev/null || fail "STAGING_URL hostname does not resolve"

  echo "Checking public TLS endpoint..."
  curl --fail --silent --show-error --location --max-time 15 "${STAGING_URL%/}/login" >/dev/null     || fail "Staging HTTPS endpoint is not reachable with a valid certificate"
else
  echo "Skipping public DNS/TLS endpoint check for pre-deploy bootstrap."
fi

coolify_base="${COOLIFY_API_URL%/}"
echo "Checking Coolify application access..."
coolify_app="$(
  curl --fail --silent --show-error --max-time 15     --header "Authorization: Bearer $COOLIFY_TOKEN"     "$coolify_base/applications/$COOLIFY_STAGING_APPLICATION_UUID"
)" || fail "Coolify application lookup failed"

coolify_uuid="$(jq -r '.uuid // empty' <<<"$coolify_app")"
[[ "$coolify_uuid" == "$COOLIFY_STAGING_APPLICATION_UUID" ]]   || fail "Coolify application UUID does not match configured staging UUID"

echo "Checking PostgreSQL connectivity..."
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc 'SELECT 1' | grep -qx '1'   || fail "Staging PostgreSQL connectivity check failed"

echo "Checking Redis connectivity..."
redis_reply="$(redis-cli -u "$STAGING_REDIS_URL" --no-auth-warning ping 2>/dev/null || true)"
[[ "$redis_reply" == "PONG" ]] || fail "Staging Redis connectivity check failed"

echo "Checking object storage bucket access..."
AWS_ACCESS_KEY_ID="$STAGING_OBJECT_STORAGE_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$STAGING_OBJECT_STORAGE_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION="$STAGING_OBJECT_STORAGE_REGION" aws s3api head-bucket   --bucket "$STAGING_OBJECT_STORAGE_BUCKET"   --endpoint-url "$STAGING_OBJECT_STORAGE_ENDPOINT" >/dev/null   || fail "Staging object-storage bucket access failed"

echo "Staging infrastructure preflight succeeded."
