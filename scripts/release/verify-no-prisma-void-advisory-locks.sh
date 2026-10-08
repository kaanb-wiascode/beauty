#!/usr/bin/env bash
set -Eeuo pipefail

matches="$(
  grep -RInF --include='*.ts' --include='*.tsx'     '`SELECT pg_advisory_xact_lock'     apps/api/src apps/api/test 2>/dev/null || true
)"

if [[ -n "$matches" ]]; then
  echo "error: direct pg_advisory_xact_lock projection found in Prisma raw query" >&2
  echo "Prisma cannot deserialize PostgreSQL void outputs reliably." >&2
  echo "Wrap the lock call in a CTE/subquery and project only a supported scalar." >&2
  echo "$matches" >&2
  exit 1
fi

echo "No direct Prisma void advisory-lock projections found."
