#!/usr/bin/env bash
set -Eeuo pipefail

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command '$1' is not installed" >&2
    exit 1
  fi
}

require_env() {
  if [[ -z "${!1:-}" ]]; then
    echo "error: environment variable '$1' is required" >&2
    exit 1
  fi
}

require_command pg_dump
require_command pg_restore
require_command psql
require_env DATABASE_URL
require_env RESTORE_TEST_DATABASE_URL

if [[ "$DATABASE_URL" == "$RESTORE_TEST_DATABASE_URL" ]]; then
  echo "error: RESTORE_TEST_DATABASE_URL must point to a disposable database and must not equal DATABASE_URL" >&2
  exit 1
fi

if [[ "${RESTORE_TEST_ACKNOWLEDGE_DISPOSABLE:-false}" != "true" ]]; then
  echo "error: RESTORE_TEST_ACKNOWLEDGE_DISPOSABLE=true is required before destructive restore verification" >&2
  exit 1
fi

database_identity() {
  psql "$1" -v ON_ERROR_STOP=1 -Atqc "SELECT current_database() || '|' || COALESCE(inet_server_addr()::text,'local') || '|' || inet_server_port()::text"
}

SOURCE_DATABASE_IDENTITY="$(database_identity "$DATABASE_URL")"
RESTORE_DATABASE_IDENTITY="$(database_identity "$RESTORE_TEST_DATABASE_URL")"

if [[ -z "$SOURCE_DATABASE_IDENTITY" || -z "$RESTORE_DATABASE_IDENTITY" ]]; then
  echo "error: unable to determine PostgreSQL source/restore database identity" >&2
  exit 1
fi

if [[ "$SOURCE_DATABASE_IDENTITY" == "$RESTORE_DATABASE_IDENTITY" ]]; then
  echo "error: restore target resolves to the source PostgreSQL database; destructive reset blocked" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./.release-backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="${BACKUP_DIR}/beauty-${TIMESTAMP}.dump"

mkdir -p "$BACKUP_DIR"

cleanup() {
  if [[ "${KEEP_BACKUP:-0}" != "1" ]]; then
    rm -f "$BACKUP_FILE"
  fi
}
trap cleanup EXIT

echo "Creating encrypted-at-rest/provider-protected backup artifact is the operator's responsibility."
echo "Creating logical PostgreSQL backup: $BACKUP_FILE"
pg_dump --format=custom --no-owner --no-acl --file="$BACKUP_FILE" "$DATABASE_URL"

if [[ ! -s "$BACKUP_FILE" ]]; then
  echo "error: backup file is empty" >&2
  exit 1
fi

echo "Validating backup archive structure"
pg_restore --list "$BACKUP_FILE" >/dev/null

echo "Checking disposable restore target connectivity"
psql "$RESTORE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc 'select 1' | grep -qx '1'

echo "Resetting disposable restore target schema"
psql "$RESTORE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
SQL

echo "Restoring backup into disposable target"
pg_restore \
  --no-owner \
  --no-acl \
  --exit-on-error \
  --dbname="$RESTORE_TEST_DATABASE_URL" \
  "$BACKUP_FILE"

echo "Verifying restored database contains Prisma migration history"
MIGRATION_COUNT="$(psql "$RESTORE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc 'select count(*) from "_prisma_migrations" where finished_at is not null and rolled_back_at is null')"

if ! [[ "$MIGRATION_COUNT" =~ ^[0-9]+$ ]] || (( MIGRATION_COUNT < 1 )); then
  echo "error: restored database has no completed Prisma migrations" >&2
  exit 1
fi

echo "Verifying core restored tables are queryable"
psql "$RESTORE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc 'select count(*) from tenants' >/dev/null
psql "$RESTORE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc 'select count(*) from companies' >/dev/null
psql "$RESTORE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc 'select count(*) from branches' >/dev/null

echo "Backup/restore verification succeeded (${MIGRATION_COUNT} completed migrations restored)."
if [[ "${KEEP_BACKUP:-0}" == "1" ]]; then
  echo "Backup retained at: $BACKUP_FILE"
fi
