# VALOO Modernization Status

Last updated: 2026-09-11

Branch: `feature/core-commerce-foundation`

> This document tracks the VALOO frontend modernization checkpoint and the remaining controlled release-preparation work. It does not replace the domain architecture documents under `/docs`.

## Current status

The shared frontend foundations and the targeted operational screens in this modernization phase have been migrated to the VALOO component systems.

Latest validated code head:

```text
0b95005bd1e97b9a9a7cd2fa4e0d367ab3c290bd
fix(web): expose form stepper semantics
```

GitHub Actions:

```text
Monorepo quality #667 — SUCCESS
```

The successful run includes Prisma validation/generation, database and shared-contract typecheck/build, API typecheck/tests/build, and web lint/typecheck/build.

The workflow's dedicated commerce lint-debt report remains non-blocking; a green quality run must not be represented as zero historical lint debt.

### Shared UI foundations

- Data View V2 is active for standardized operational list/filter/table surfaces.
- Form System V2 is active for reusable forms, actions, hints and steppers.
- Finance View V2 is active for finance/CFO metrics, panels, statuses and empty states.
- Typed CFO and Inventory domain contracts define frontend boundaries.
- Inventory uses a reusable multi-step form shell.

### Shared accessibility hardening completed

- Search fields have a guaranteed accessible name and search enter-key hint.
- Filter chips expose pressed/selected state to assistive technologies.
- ESC search hints are shown only when a matching keyboard handler exists.
- Modal title/description IDs are unique per modal instance.
- Dialog focus moves to the first actionable control or falls back to the dialog itself.
- Focus trapping and focus restoration remain active.
- FormStepper exposes navigation semantics and `aria-current="step"` for the active step.

### Migrated operational screens

- Customers
- Staff
- Services
- Payments
- Appointments
- Inventory main screen
- Inventory movements
- Inventory purchase requests
- Inventory transfers
- HR dynamic sections: employees, personnel files, attendance, leaves, payroll, payments and SGK
- HR dashboard
- Payroll dashboard
- Finance reconciliation
- CFO management cockpit
- CFO treasury cockpit
- Financial integration operations
- Financial integrations management

### Inventory main screen

`apps/web/app/(app)/inventory/page.tsx` now uses the prepared typed/shared foundations while preserving the existing product, asset, category and supplier endpoints and payload semantics.

Completed in the migration:

- shared Inventory domain contracts are used;
- local `any` usage in the migrated surface was removed;
- multi-step product and asset creation uses the shared Inventory form shell / FormStepper system;
- shared search/filter controls are used where appropriate;
- purchase navigation uses application routing instead of direct `window.location` mutation;
- stock and inventory business rules were not intentionally changed.

Validated implementation commit:

```text
2097f4fe9433203498a14eddf20d7278f7071be5
refactor(web): integrate inventory main with VALOO form foundations
```

### Non-functional UI action cleanup

The Services quick panel no longer presents unimplemented category/package actions as working controls. The quick-action component now requires a real click handler, preventing the same class of no-op action from being added accidentally.

Commit:

```text
6d209349d5ecbd8b9fdd773a1a7aa162699d2bdf
fix(web): remove non-functional service actions
```

## Financial and security invariants

The modernization did not intentionally alter financial calculation semantics or integration contracts. The following invariants remain mandatory:

- Tenant/company/branch isolation is preserved.
- Financial mutations remain auditable and use existing backend idempotency/concurrency rules.
- Provider credentials are never displayed after storage and are sent only to the encrypted credential-vault flow.
- Internet-banking usernames and passwords are not collected.
- Provider/live balances never replace accounting-ledger truth; reconciliation remains explicit.

## Remaining controlled work

### 1. Manual visual / responsive QA

CI verifies code quality and builds, but it does not prove visual behavior in a real browser. Before release, manually verify representative desktop/mobile flows for:

- long-content overflow;
- sticky/scrolling surfaces;
- modal and multi-step form sizing;
- mobile list/table fallbacks;
- keyboard focus order;
- reduced-motion behavior;
- finance, HR and inventory high-density screens.

### 2. Branding / technical naming cleanup

Current product-facing name: **VALOO**.

Historical documentation and internal technical names still contain the previous `Beauty ERP` wording. Branding cleanup must distinguish:

1. active product-facing/current-status wording that should use VALOO;
2. historical comments/documentation that can be migrated safely;
3. technical identifiers, package names, database names, migrations, environment variables and deployment references whose renaming may cause regressions.

Do not perform broad package/database/environment renames without dependency analysis.

### 3. Local Dashboard/AppShell reconciliation

Dashboard/AppShell may have newer local work outside the remote branch. Do not overwrite those files from stale remote state. Reconcile local changes before any final release/merge preparation touching those surfaces.

### 4. Release decision

This modernization checkpoint is complete at the code/CI level, but it is not a release declaration and does not authorize merging to `main`.

The next release-preparation sequence is:

```text
Manual visual/responsive smoke QA
        ↓
Reconcile any newer local Dashboard/AppShell work
        ↓
Controlled brand/documentation cleanup as needed
        ↓
Final release candidate regression
        ↓
Explicit merge/release decision
```

## Known limitations / intentional constraints

- Some list pages intentionally expose only records returned by current backend limits; UI copy must not imply global counts when the data is page-local.
- Existing commerce lint debt is tracked separately and is non-blocking in the current workflow.
- CI success does not substitute for browser-level visual QA.
- Technical `beauty*` identifiers are not automatically a user-facing branding defect and should not be bulk-renamed.

## Modernization definition of completion

Code-level completion criteria are satisfied:

1. Inventory main screen uses the shared/typed foundations without intentional changes to inventory business semantics. ✅
2. Knowingly non-functional Services quick actions were removed. ✅
3. Shared search/filter/modal/stepper accessibility was hardened. ✅
4. Product-facing current-status documentation uses VALOO. ✅
5. Final code head passed full Monorepo quality run #667. ✅
6. `main` remains untouched by this modernization work. ✅

Remaining activities are release preparation and manual verification rather than unfinished modernization implementation.