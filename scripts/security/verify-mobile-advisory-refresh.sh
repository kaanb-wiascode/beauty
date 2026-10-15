#!/usr/bin/env bash
# Regenerate and verify the mobile-toolchain advisory fixes without suppressing audit findings.
set -euo pipefail

if [[ "$(git branch --show-current)" != "feature/core-commerce-foundation" ]]; then
  echo "Refusing to alter dependencies outside feature/core-commerce-foundation" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to modify a dirty working tree" >&2
  exit 1
fi

: "${CI:=}"
pnpm --version
node --version

# Keep this change isolated to the two advisory packages and preserve other overrides.
# A real registry-backed pnpm resolution is required to generate integrity hashes.
pnpm --config.confirmModulesPurge=false install --lockfile-only --ignore-scripts
pnpm install --frozen-lockfile
pnpm audit --prod --audit-level=high

echo "Review pnpm-workspace.yaml and pnpm-lock.yaml before committing."
echo "Verify the resolved node-forge version is >= 1.4.1 and braces >= 3.0.4."
