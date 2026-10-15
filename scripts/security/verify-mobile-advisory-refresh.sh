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

pnpm --version
node --version

# Set targeted replacements without changing other package resolution constraints.
node <<'NODE'
const fs = require('node:fs');
const file = 'pnpm-workspace.yaml';
let config = fs.readFileSync(file, 'utf8');
for (const oldVersion of [
  "'node-forge@1.4.0': 1.4.1",
  "'braces@3.0.3': 3.0.4",
]) {
  if (config.includes(oldVersion)) continue;
  if (!config.includes('overrides:' + String.fromCharCode(10))) throw new Error('pnpm overrides section missing');
  config = config.replace('overrides:' + String.fromCharCode(10), 'overrides:' + String.fromCharCode(10) + '  ' + oldVersion + String.fromCharCode(10));
}
fs.writeFileSync(file, config);
NODE

# Registry-backed resolution generates real package integrity hashes in the lockfile.
pnpm install --lockfile-only --ignore-scripts

# Fail closed when the registry or resolver leaves vulnerable versions in the lockfile.
node <<'NODE'
const fs = require('node:fs');
const lock = fs.readFileSync('pnpm-lock.yaml', 'utf8');
for (const [packageName, vulnerable, patched] of [
  ['node-forge', '1.4.0', '1.4.1'],
  ['braces', '3.0.3', '3.0.4'],
]) {
  const marker = packageName + '@' + patched + ':';
  if (!lock.includes(marker)) {
    throw new Error('Expected patched resolution missing: ' + marker);
  }
  const oldMarker = packageName + '@' + vulnerable + ':';
  if (lock.includes(oldMarker) || lock.includes(packageName + ': ' + vulnerable)) {
    throw new Error('Vulnerable resolution remains: ' + oldMarker);
  }
}
NODE

pnpm install --frozen-lockfile
pnpm audit --prod --audit-level=high

echo "Review pnpm-workspace.yaml and pnpm-lock.yaml before committing."
echo "Verify the resolved node-forge version is >= 1.4.1 and braces >= 3.0.4."
