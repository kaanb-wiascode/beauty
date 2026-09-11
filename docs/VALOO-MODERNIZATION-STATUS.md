# VALOO Modernization Status

Last updated: 2026-09-11

Branch: `feature/core-commerce-foundation`

> This document tracks the active VALOO frontend modernization and the remaining controlled cleanup work. It does not replace the domain architecture documents under `/docs`.

## Current status

The shared frontend foundations and the majority of operational screens have been migrated to the VALOO design system. The latest validated head before this document update was `85fd8d52356036c0cd54646ab789a91733f63efb`, and Monorepo quality run `#659` completed successfully, including API tests/build and web lint/typecheck/build.

### Shared UI foundations

- Data View V2 is active for operational list/filter/table surfaces.
- Form System V2 is active for reusable forms, actions, hints and steppers.
- Finance View V2 is active for finance/CFO metrics, panels, statuses and empty states.
- Typed CFO and Inventory domain contracts have been introduced for frontend boundaries.

### Migrated operational screens

- Customers
- Staff
- Services
- Payments
- Appointments
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

## Financial and security invariants

The modernization must not alter financial calculation semantics or integration contracts. The following invariants remain mandatory:

- Tenant/company/branch isolation is preserved.
- Financial mutations remain auditable and use existing backend idempotency/concurrency rules.
- Provider credentials are never displayed after storage and are sent only to the encrypted credential-vault flow.
- Internet-banking usernames and passwords are not collected.
- Provider/live balances never replace accounting-ledger truth; reconciliation remains explicit.

## Remaining work

### 1. Inventory main screen

`apps/web/app/(app)/inventory/page.tsx` is the largest remaining frontend migration surface. It currently combines products, assets, categories, suppliers, overview metrics and multi-step create flows in one large page.

Prepared foundations:

- `apps/web/lib/inventory-types.ts`
- `apps/web/components/inventory-form-shell.tsx`

The integration must preserve the existing product, asset, category and supplier payload semantics and existing inventory endpoints. It should remove local `any` usage, reuse the typed Inventory contracts, adopt the shared Data View/Form System components where practical, and preserve inventory permissions.

### 2. Consistency / accessibility cleanup

- Remove or clearly disable UI actions that do not have a real backend or route.
- Complete keyboard/focus checks for dialogs, steppers, filters and action controls.
- Complete mobile/responsive review on migrated finance, HR and inventory surfaces.
- Reduce remaining hard-coded legacy palette usage in actively migrated screens.
- Keep existing reduced-motion and accessible labeling behavior intact.

### 3. Branding / technical naming cleanup

Historical documentation and internal technical names still contain the previous `Beauty ERP` wording. For example, `docs/00-PROJECT-CONTEXT.md` still uses the old product name. Branding cleanup must distinguish user-facing/product naming from technical identifiers whose renaming could cause package, migration, environment or deployment regressions.

Product-facing name: **VALOO**.

Do not perform broad package/database/environment renames without dependency analysis.

### 4. Documentation and final regression

After the Inventory main-screen migration and consistency pass:

- update affected architecture/runbook documents where behavior or component boundaries changed;
- run the full monorepo quality workflow;
- verify API tests/build, web lint/typecheck/build and critical finance/inventory flows;
- document any remaining known lint debt separately rather than representing the repository as debt-free.

## Known limitations / intentional constraints

- Some list pages intentionally expose only the records returned by current backend limits; UI copy should not imply global counts when the data is page-local.
- Existing commerce lint debt reported by the workflow is tracked separately and is currently non-blocking; it should not be confused with successful typecheck/build status.
- Dashboard/AppShell may have newer local work outside the remote branch. Do not overwrite those files from stale remote state without reconciliation.

## Definition of completion for this modernization phase

The phase is complete when:

1. Inventory main screen uses the prepared shared/typed foundations without changing inventory business semantics.
2. No knowingly non-functional primary action is presented as working functionality.
3. Responsive/accessibility/consistency checks are complete for the migrated surfaces.
4. Product-facing VALOO naming is consistent in active UI and current-status documentation.
5. The final branch head passes the full Monorepo quality workflow.
6. `main` remains untouched until an explicit merge/release decision is made.
