#!/usr/bin/env bash
set -Eeuo pipefail

: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${API_IMAGE:?API_IMAGE is required}"
: "${WEB_IMAGE:?WEB_IMAGE is required}"

DEPLOY_ENV="${DEPLOY_ENV:-staging}"
MANIFEST_DIR="${RELEASE_MANIFEST_DIR:-.release-manifests}"
BACKUP_REFERENCE="${BACKUP_REFERENCE:-}"
ROLLBACK_FROM_SHA="${ROLLBACK_FROM_SHA:-}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$MANIFEST_DIR"
umask 077
manifest_path="$MANIFEST_DIR/${timestamp}-${RELEASE_SHA}.json"

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  printf "%s" "$value"
}

cat >"$manifest_path" <<EOF
{
  "releaseSha": "$(json_escape "$RELEASE_SHA")",
  "apiImage": "$(json_escape "$API_IMAGE")",
  "webImage": "$(json_escape "$WEB_IMAGE")",
  "deployEnvironment": "$(json_escape "$DEPLOY_ENV")",
  "backupReference": "$(json_escape "$BACKUP_REFERENCE")",
  "rollbackFromSha": "$(json_escape "$ROLLBACK_FROM_SHA")",
  "deployedAtUtc": "$timestamp"
}
EOF

echo "Release manifest written to $manifest_path"
