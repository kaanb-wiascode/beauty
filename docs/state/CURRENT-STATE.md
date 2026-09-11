# VALOO — Current State

> Bu dosya projenin mevcut teknik ve ürün durumunun ana referansıdır.
> Yeni bir geliştirme oturumunda önce bu dosya, ardından ilgili domain/runbook belgeleri okunmalıdır.

Last updated: 2026-09-11

---

## 1. Project Identity

**Product Name:** VALOO  
**Repository:** `kaanb-wiascode/beauty`  
**Active Development Branch:** `feature/core-commerce-foundation`  
**Default Branch:** `main`  
**Product Type:** Multi-tenant SaaS CRM + ERP  
**Initial Market:** Türkiye

Target businesses include beauty, aesthetics, medical-aesthetics and clinic-style service organizations.

### Branch rule

All current development described in this file is on `feature/core-commerce-foundation`.

`main` must not be merged into or written to as part of incremental development unless an explicit release/merge decision is made.

---

## 2. Current Development Phase

The project is no longer in the early Foundation/Redis checkpoint documented by the previous version of this file.

Current phase:

> **Core commerce + operational ERP hardening and VALOO frontend modernization**

Current priorities:

1. Preserve tenant/company/branch isolation.
2. Preserve financial idempotency, auditability, concurrency and accounting integrity.
3. Complete operational UI migration to the shared VALOO component systems.
4. Remove non-functional UI actions rather than presenting future features as working.
5. Complete responsive/accessibility/consistency review.
6. Update current documentation and run full regression/CI before any release decision.

---

## 3. Verified Quality State

Latest fully verified implementation head before this documentation update:

```text
85fd8d52356036c0cd54646ab789a91733f63efb
fix(web): repair finance integrations lint blocker
```

GitHub Actions:

```text
Monorepo quality #659 — SUCCESS
```

The successful workflow included:

- Prisma schema validation and client generation
- database package typecheck/build
- shared commerce contract typecheck/build
- API typecheck
- API tests
- API build
- web lint
- web typecheck
- web build

API test result on the preceding failing lint run was 38 suites / 126 tests passing; the failure was isolated to a web lint error and was subsequently fixed before #659 passed.

The workflow still reports existing commerce lint debt in its dedicated non-blocking reporting step. A green quality run must not be represented as meaning the repository has zero lint debt.

---

## 4. Core Architecture Invariants

The following rules are active and must not be weakened by UI or domain work:

- Tenant is the primary isolation boundary.
- Company/legal-entity and branch context must be preserved where applicable.
- Employee and User remain separate concepts.
- Authorization is permission/scope-aware and must not rely on role name alone.
- Financial mutations must remain auditable.
- Existing idempotency/concurrency/accounting rules must be preserved.
- Provider/live-bank balances never replace accounting-ledger truth.
- Reconciliation remains explicit.
- Secrets/API credentials must not be returned to the client after storage.
- Internet-banking usernames/passwords are not collected.
- External financial integrations use the integration layer rather than embedding provider logic into business-domain code.

---

## 5. Shared Frontend Systems

### Data View V2

Path:

```text
apps/web/components/data-view.tsx
```

Used for standardized search/filter/list/table surfaces.

Primary primitives include:

- `DataView`
- `DataViewToolbar`
- `SearchField`
- `FilterChip`
- `ToolbarButton`
- `ToolbarSelect`
- `DataViewMeta`

### Form System V2

Path:

```text
apps/web/components/form-system.tsx
```

Primary primitives include:

- `FormSection`
- `FormGrid`
- `FormActions`
- `FormHint`
- `CheckboxField`
- `FormStepper`
- `FormSubmitButton`

### Finance View V2

Path:

```text
apps/web/components/finance-view.tsx
```

Primary primitives include:

- `FinanceMetric`
- `FinancePanel`
- `FinanceTabs`
- `FinanceTab`
- `FinanceStatus`
- `FinanceEmpty`

### Typed frontend domain contracts

```text
apps/web/lib/cfo-types.ts
apps/web/lib/inventory-types.ts
```

Inventory form shell:

```text
apps/web/components/inventory-form-shell.tsx
```

---

## 6. Frontend Modernization Completed

### Customer / Commerce Operations

- Customers — Data View V2
- Staff — Data View V2 + reusable multi-step staff form
- Services — Data View V2 + Form System
- Payments — Data View V2
- Appointments — Data View V2
- Dashboard quick actions — Form System and explicit consent handling

Important compliance correction already completed:

The quick customer form no longer silently sends KVKK acknowledgement or membership agreement as `true`; consent is explicitly collected in the UI.

### HR / Payroll

Completed:

- HR dynamic section framework
- employees
- personnel files
- attendance
- leaves
- payroll
- salary payments
- SGK
- HR dashboard
- payroll dashboard

The HR dashboard no longer presents placeholder tabs as implemented functionality; real operational routes are used.

### Finance / CFO

Completed:

- reconciliation center
- CFO typed domain contracts
- CFO management cockpit
- treasury cockpit
- integration operations
- financial integrations management

Financial integration flows preserved:

- provider registry
- integration creation
- OAuth/connect
- sync
- disconnect
- health
- consent status
- encrypted credential-vault write/clear
- liquidity
- POS near-cash
- bank transactions

Credential values are not read back to the UI after storage.

### Inventory submodules

Completed:

- inventory movements
- purchase requests
- transfers
- typed Inventory frontend contracts
- reusable Inventory FormStepper shell

A false `+ Yeni talep` action was removed from purchase requests after backend inspection confirmed there is no create endpoint for that flow.

---

## 7. Remaining Major Frontend Work

### Inventory main screen

Path:

```text
apps/web/app/(app)/inventory/page.tsx
```

This is the largest remaining modernization surface. It currently combines:

- products
- assets
- categories
- suppliers
- overview metrics
- critical stock
- warehouse/location views
- multi-step product creation
- multi-step asset creation

Prepared migration foundations:

```text
apps/web/lib/inventory-types.ts
apps/web/components/inventory-form-shell.tsx
```

The migration must preserve the current inventory API/payload semantics and permissions. It should remove remaining local `any` usage and move the form shell/list presentation onto the shared systems without changing stock business rules.

### Consistency cleanup

Known remaining item:

- Services quick panel contains category/package actions without a verified functional route/backend flow. These must be removed, disabled/labeled as unavailable, or wired only after an actual route/endpoint is verified.

### Responsive and accessibility pass

Final review still required for:

- keyboard/focus behavior
- modal/stepper navigation
- mobile list/table fallbacks
- focus-visible states
- semantic labels
- reduced-motion behavior
- long-content overflow

---

## 8. Known Data-Scope Constraints

Some frontend pages intentionally operate on limited or page-local datasets. UI text must remain truthful about this.

Examples:

- Payments currently works over a bounded recent record set rather than an unlimited global dataset.
- Appointments uses a bounded API result size.
- Some Staff status counts are page-local rather than global.
- Financial Integrations bank movement view explicitly represents the latest bounded set returned by its endpoint.

Do not present page-local counts as global totals.

---

## 9. Branding State

Current product-facing brand:

> **VALOO**

Historical source files and architecture documents still contain `Beauty ERP` wording and technical `beauty*` identifiers.

Brand cleanup must distinguish between:

1. user-facing/product wording that should become VALOO;
2. comments/documentation that can be migrated safely;
3. technical identifiers, package names, database names, migrations, environment variables or deployment references whose renaming may cause regressions.

Do not bulk-rename technical identifiers without dependency analysis.

`docs/VALOO-MODERNIZATION-STATUS.md` contains the active modernization checklist.

---

## 10. Local/Remote Reconciliation Warning

Dashboard/AppShell work may exist locally in a newer state than the remote branch.

Do not overwrite the remote Dashboard/AppShell files as part of cleanup without first reconciling the user's local work.

This warning does not apply to the already migrated Customers, Staff, Services, Payments, Appointments, Finance, HR and Inventory submodule files listed above.

---

## 11. Documentation Protocol

At each significant milestone:

1. inspect the current implementation before editing;
2. preserve existing domain/API semantics;
3. commit only to `feature/core-commerce-foundation`;
4. run/check the real GitHub Actions workflow;
5. fix blocking lint/typecheck/build/test errors;
6. update `docs/state/CURRENT-STATE.md` when project state materially changes;
7. update relevant architecture/runbook docs when contracts or operational behavior change.

Do not use a missing combined commit status as proof that CI passed; inspect the actual Actions workflow runs/jobs.

---

## 12. Current Next Action

NEXT ACTION:

```text
Inventory main-screen controlled migration
        ↓
Services non-functional action cleanup
        ↓
Responsive / Accessibility / Consistency pass
        ↓
Controlled product-brand documentation cleanup
        ↓
Final full Monorepo quality regression
```

The Inventory migration should be incremental and must preserve product/asset/category/supplier creation semantics and stock integrity.

---

## 13. Current Status Summary

```text
Core multi-tenant architecture       ✅ established
Authorization foundation             ✅ established
CRM / Customers                      ✅ active
Appointments                         ✅ active
Services                             ✅ active
Payments                             ✅ active
Finance / Reconciliation             ✅ active + migrated
CFO cockpit                          ✅ active + migrated
Treasury                             ✅ active + migrated
Financial integrations               ✅ active + migrated
HR dynamic modules                   ✅ active + migrated
Payroll dashboard                    ✅ active + migrated
Inventory movements                  ✅ migrated
Inventory purchase requests          ✅ migrated
Inventory transfers                  ✅ migrated
Inventory typed/form foundations     ✅ prepared
Inventory main screen                ⏳ final large migration
Responsive/accessibility pass        ⏳ final review
Brand/docs cleanup                   ⏳ controlled cleanup
Final regression CI                  ⏳ after remaining changes
```

---

## 14. Release Boundary

This state is a development-branch checkpoint, not a release declaration.

`main` remains untouched by this modernization work until an explicit merge/release decision is made.
