#!/usr/bin/env bash
set -Eeuo pipefail

required=(
  PRODUCTION_URL
  COOLIFY_API_URL
  COOLIFY_TOKEN
  COOLIFY_PRODUCTION_APPLICATION_UUID
  PRODUCTION_DATABASE_URL
  PRODUCTION_REDIS_URL
  PRODUCTION_OBJECT_STORAGE_BUCKET
  PRODUCTION_OBJECT_STORAGE_REGION
  PRODUCTION_OBJECT_STORAGE_ENDPOINT
  PRODUCTION_OBJECT_STORAGE_ACCESS_KEY_ID
  PRODUCTION_OBJECT_STORAGE_SECRET_ACCESS_KEY
)

fail() {
  echo "error: $*" >&2
  exit 1
}

for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || fail "$name is required"
done

for command in curl jq psql redis-cli python3 aws getent; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done

[[ "$PRODUCTION_URL" =~ ^https://[^/]+$ ]] || fail "PRODUCTION_URL must be an HTTPS origin without a path"
[[ "$COOLIFY_API_URL" == https://* ]] || fail "COOLIFY_API_URL must use HTTPS"
[[ "$PRODUCTION_OBJECT_STORAGE_ENDPOINT" == https://* ]] || fail "PRODUCTION_OBJECT_STORAGE_ENDPOINT must use HTTPS"

production_host="$(python3 - <<'PY'
import os
from urllib.parse import urlparse
print(urlparse(os.environ["PRODUCTION_URL"]).hostname or "")
PY
)"
[[ -n "$production_host" ]] || fail "Unable to parse production hostname"

if [[ "${PRODUCTION_SKIP_PUBLIC_ENDPOINT:-false}" != "true" ]]; then
  echo "Checking DNS resolution for $production_host..."
  getent ahosts "$production_host" >/dev/null || fail "PRODUCTION_URL hostname does not resolve"

  echo "Checking public TLS endpoint..."
  curl --fail --silent --show-error --location --max-time 15 "${PRODUCTION_URL%/}/login" >/dev/null     || fail "Production HTTPS endpoint is not reachable with a valid certificate"
else
  echo "Skipping public DNS/TLS endpoint check for pre-deploy bootstrap."
fi

coolify_base="${COOLIFY_API_URL%/}"
echo "Checking Coolify production application access..."
coolify_app="$(
  curl --fail --silent --show-error --max-time 15     --header "Authorization: Bearer $COOLIFY_TOKEN"     "$coolify_base/applications/$COOLIFY_PRODUCTION_APPLICATION_UUID"
)" || fail "Coolify production application lookup failed"

coolify_uuid="$(jq -r '.uuid // empty' <<<"$coolify_app")"
[[ "$coolify_uuid" == "$COOLIFY_PRODUCTION_APPLICATION_UUID" ]]   || fail "Coolify production application UUID does not match configured UUID"

echo "Checking PostgreSQL connectivity..."
psql "$PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc 'SELECT 1' | grep -qx '1'   || fail "Production PostgreSQL connectivity check failed"

echo "Checking Redis connectivity..."
redis_reply="$(redis-cli -u "$PRODUCTION_REDIS_URL" --no-auth-warning ping 2>/dev/null || true)"
[[ "$redis_reply" == "PONG" ]] || fail "Production Redis connectivity check failed"

echo "Checking object storage bucket access..."
AWS_ACCESS_KEY_ID="$PRODUCTION_OBJECT_STORAGE_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$PRODUCTION_OBJECT_STORAGE_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION="$PRODUCTION_OBJECT_STORAGE_REGION" aws s3api head-bucket   --bucket "$PRODUCTION_OBJECT_STORAGE_BUCKET"   --endpoint-url "$PRODUCTION_OBJECT_STORAGE_ENDPOINT" >/dev/null   || fail "Production object-storage bucket access failed"

echo "Production infrastructure preflight succeeded."
