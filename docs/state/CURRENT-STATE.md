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

All work in this checkpoint is on `feature/core-commerce-foundation`. `main` must remain untouched until an explicit merge/release decision is made.

---

## 2. Current Development Phase

Current phase:

> **Core commerce + operational ERP hardening and VALOO frontend modernization — final cleanup/regression stage**

Current priorities:

1. Preserve tenant/company/branch isolation.
2. Preserve financial idempotency, auditability, concurrency and accounting integrity.
3. Remove UI actions that do not have a verified working route/backend flow.
4. Complete responsive/accessibility/consistency review.
5. Continue controlled VALOO naming/documentation cleanup without risky bulk technical renames.
6. Finish with a full green Monorepo quality run before any release decision.

---

## 3. Verified Quality State

Latest fully verified implementation head:

```text
2097f4fe9433203498a14eddf20d7278f7071be5
refactor(web): integrate inventory main with VALOO form foundations
```

GitHub Actions:

```text
Monorepo quality #662 — SUCCESS
```

The verified workflow includes:

- Prisma schema validation and client generation
- database package typecheck/build
- shared commerce contract typecheck/build
- API typecheck
- API tests
- API build
- web lint
- web typecheck
- web build

The workflow still contains a dedicated non-blocking commerce lint-debt reporting step. A green quality run does not mean the repository has zero historical lint debt.

A later shared accessibility commit is currently being validated separately:

```text
b89680611b937707db67f0026b1ded2f0cb2d2a4
fix(web): improve data view accessibility
```

---

## 4. Core Architecture Invariants

The following rules must not be weakened by UI or domain work:

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

```text
apps/web/components/data-view.tsx
```

Primary primitives:

- `DataView`
- `DataViewToolbar`
- `SearchField`
- `FilterChip`
- `ToolbarButton`
- `ToolbarSelect`
- `DataViewMeta`

The shared accessibility pass now guarantees a search-field accessible name, communicates filter-chip pressed state and only shows the ESC hint when a key handler exists.

### Form System V2

```text
apps/web/components/form-system.tsx
```

Primary primitives:

- `FormSection`
- `FormGrid`
- `FormActions`
- `FormHint`
- `CheckboxField`
- `FormStepper`
- `FormSubmitButton`

### Finance View V2

```text
apps/web/components/finance-view.tsx
```

Primary primitives:

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
- Dashboard quick actions — Form System + explicit consent handling

Important compliance correction:

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

Financial integration behavior preserved:

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

### Inventory

Completed:

- inventory movements
- purchase requests
- transfers
- typed Inventory frontend contracts
- reusable Inventory FormStepper shell
- main inventory screen integration

The main inventory screen now uses shared Inventory domain contracts and form shells while preserving product/asset/category/supplier API and payload behavior. Local `any` usage in the migrated surface was removed and purchase navigation now uses application routing rather than direct `window.location` mutation.

A false `+ Yeni talep` action was removed from purchase requests after backend inspection confirmed there is no create endpoint for that flow.

---

## 7. Remaining Frontend Work

### Services consistency cleanup

Known remaining item:

- Services quick panel still contains category/package actions without a verified functional route/backend flow. These must be removed or only wired after an actual route/endpoint is verified.

### Responsive / accessibility / consistency final pass

Remaining review areas:

- keyboard/focus behavior
- modal/stepper navigation
- mobile list/table fallbacks
- focus-visible states
- semantic labels
- reduced-motion behavior
- long-content overflow

The shared Data View accessibility correction is already implemented; route-specific review remains.

### Controlled branding cleanup

Historical files and architecture documentation still contain `Beauty ERP` wording and technical `beauty*` identifiers.

Cleanup must distinguish between:

1. user-facing/product wording that should become VALOO;
2. comments/documentation that can be migrated safely;
3. technical identifiers, package names, database names, migrations, environment variables or deployment references whose renaming may cause regressions.

Do not bulk-rename technical identifiers without dependency analysis.

---

## 8. Known Data-Scope Constraints

Some frontend pages intentionally operate on limited or page-local datasets. UI text must remain truthful about this.

Examples:

- Payments works over a bounded recent record set rather than an unlimited global dataset.
- Appointments uses a bounded API result size.
- Some Staff status counts are page-local rather than global.
- Financial Integrations bank movement view represents the latest bounded set returned by its endpoint.

Do not present page-local counts as global totals.

---

## 9. Branding State

Current product-facing brand:

> **VALOO**

`docs/VALOO-MODERNIZATION-STATUS.md` contains the modernization checklist.

Old `Beauty ERP` wording in legacy documents is historical technical debt and should not be treated as the current product name.

---

## 10. Local/Remote Reconciliation Warning

Dashboard/AppShell work may exist locally in a newer state than the remote branch.

Do not overwrite remote Dashboard/AppShell files during cleanup without first reconciling the user's local work.

This warning does not apply to the already migrated Customers, Staff, Services, Payments, Appointments, Finance, HR and Inventory surfaces listed above.

---

## 11. Documentation Protocol

At each significant milestone:

1. inspect the current implementation before editing;
2. preserve existing domain/API semantics;
3. commit only to `feature/core-commerce-foundation`;
4. inspect the real GitHub Actions workflow;
5. fix blocking lint/typecheck/build/test errors;
6. update `docs/state/CURRENT-STATE.md` when project state materially changes;
7. update architecture/runbook docs when contracts or operational behavior change.

Do not use an empty combined commit status as proof that CI passed; inspect actual Actions runs/jobs.

---

## 12. Current Next Action

```text
Services non-functional action cleanup
        ↓
Route-specific Responsive / Accessibility / Consistency pass
        ↓
Controlled VALOO documentation/brand cleanup
        ↓
Final full Monorepo quality regression
```

---

## 13. Current Status Summary

```text
Core multi-tenant architecture       ✅ established
Authorization foundation             ✅ established
CRM / Customers                      ✅ active + migrated
Appointments                         ✅ active + migrated
Services                             ✅ active + migrated
Payments                             ✅ active + migrated
Finance / Reconciliation             ✅ active + migrated
CFO cockpit                          ✅ active + migrated
Treasury                             ✅ active + migrated
Financial integrations               ✅ active + migrated
HR dynamic modules                   ✅ active + migrated
Payroll dashboard                    ✅ active + migrated
Inventory movements                  ✅ migrated
Inventory purchase requests          ✅ migrated
Inventory transfers                  ✅ migrated
Inventory typed/form foundations     ✅ migrated
Inventory main screen                ✅ migrated + CI verified
Shared Data View accessibility       ✅ implemented; CI validation pending
Services fake-action cleanup         ⏳ final cleanup
Route accessibility/consistency      ⏳ final review
Brand/docs cleanup                   ⏳ controlled cleanup
Final regression CI                  ⏳ after remaining changes
```

---

## 14. Release Boundary

This is a development-branch checkpoint, not a release declaration.

`main` remains untouched by this modernization work until an explicit merge/release decision is made.
