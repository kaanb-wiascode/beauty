# Mobile dependency audit remediation

Status: blocked on upstream package publication or a reviewed dependency replacement.

## Reproducible baseline

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm audit --prod --audit-level=high --json
```

The 2026-10-17 audit fails on two mobile transitive dependencies:

| Dependency | Locked version | Incoming dependency |
| --- | --- | --- |
| node-forge | 1.4.0 | @expo/cli, @expo/code-signing-certificates |
| braces | 3.0.3 | micromatch (via Expo/React Native Metro tooling) |

The advisory marks `node-forge <=1.4.0` and `braces <=3.0.3` as vulnerable and lists `>=1.4.1` and `>=3.0.4` as patched ranges. An advisory patched range does **not** guarantee a corresponding official npm version is published. Do not add overrides pointing to unpublished packages or silently install a third-party fork.

## Resolution checklist

1. Check the **official** npm registry for available releases:
   `pnpm view node-forge versions --json` and `pnpm view braces versions --json`.
2. Inspect `pnpm why --filter mobile node-forge` and `pnpm why --filter mobile braces`.
3. Prefer updated, supported Expo/React Native/Metro parent packages that remove the vulnerable version. For `node-forge`, assess whether Expo CLI or certificate tooling can be upgraded without breaking SDK compatibility.
4. If an official patched release is available, add a narrowly scoped override to `pnpm-workspace.yaml`; regenerate **both** workspace resolution and integrity entries using `pnpm install --lockfile-only`. Do not manually fabricate lockfile integrity.
5. Run `pnpm install --frozen-lockfile`, API tests, mobile bundling, and `pnpm audit --prod --audit-level=high --json`.
6. Require a passing **Security checks** CI run before marking the remediation complete.

The production runtime dependency boundary, CodeQL and secret scan jobs are separate successful checks; none substitutes for the failing audit.
