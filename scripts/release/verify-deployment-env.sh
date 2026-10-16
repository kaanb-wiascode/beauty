#!/usr/bin/env bash
set -Eeuo pipefail

required_vars=(
  RELEASE_SHA
  API_IMAGE
  WEB_IMAGE
  CORS_ORIGINS
  PUBLIC_API_URL
  DATABASE_URL
  REDIS_URL
  JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET
  OBJECT_STORAGE_BUCKET
  OBJECT_STORAGE_ENDPOINT
  OBJECT_STORAGE_ACCESS_KEY_ID
  OBJECT_STORAGE_SECRET_ACCESS_KEY
)

fail() {
  echo "error: $*" >&2
  exit 1
}

for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    fail "$name is required"
  fi
done

if [[ ! "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  fail "RELEASE_SHA must be a full 40-character lowercase Git commit SHA"
fi

for image_var in API_IMAGE WEB_IMAGE; do
  image_ref="${!image_var}"
  if [[ "$image_ref" == *":latest" || "$image_ref" == "latest" ]]; then
    fail "$image_var must never use the latest tag"
  fi
  if [[ "$image_ref" != *"$RELEASE_SHA"* ]]; then
    fail "$image_var must contain RELEASE_SHA so staging and production promote the exact same candidate"
  fi
done

IFS="," read -ra origins <<< "$CORS_ORIGINS"
for origin in "${origins[@]}"; do
  normalized="${origin//[[:space:]]/}"
  [[ "$normalized" == https://* ]] || fail "every CORS origin must use HTTPS: $origin"
done

[[ "$PUBLIC_API_URL" == https://* ]] || fail "PUBLIC_API_URL must use HTTPS"
[[ "$OBJECT_STORAGE_ENDPOINT" == https://* ]] || fail "OBJECT_STORAGE_ENDPOINT must use HTTPS"

if (( ${#JWT_ACCESS_SECRET} < 32 )); then
  fail "JWT_ACCESS_SECRET must be at least 32 characters"
fi

if (( ${#JWT_REFRESH_SECRET} < 32 )); then
  fail "JWT_REFRESH_SECRET must be at least 32 characters"
fi

if [[ "$DATABASE_URL" == *"localhost"* || "$DATABASE_URL" == *"127.0.0.1"* ]]; then
  fail "DATABASE_URL must not point to localhost"
fi

if [[ "$REDIS_URL" == *"localhost"* || "$REDIS_URL" == *"127.0.0.1"* ]]; then
  fail "REDIS_URL must not point to localhost"
fi

echo "Deployment environment preflight succeeded for release $RELEASE_SHA."
