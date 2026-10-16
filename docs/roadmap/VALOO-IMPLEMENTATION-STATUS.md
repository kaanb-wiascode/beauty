# VALOO — Implementation Status

> Purpose: evidence-based implementation tracker.
> Update this file when Marketplace/Supplier/Procurement or Healthcare ecosystem code materially changes.

## 1. Current Branch

`feature/core-commerce-foundation`

Do not merge/push to `main` without explicit approval.

## 2. Current Implemented Foundations

### CRM Pipeline

Status: **Lead + Opportunity + Follow-up foundation and operational web UI implemented; Sale linkage pending**

Implemented:

- branch-scoped Lead create/read/update lifecycle
- controlled Lead qualification that creates at most one Opportunity
- SERIALIZABLE qualification transaction with optimistic Lead version checks
- governed Opportunity stage transitions and terminal probability rules
- Opportunity win converts the originating Lead without creating duplicate financial truth
- Lead/Opportunity Follow-up create/list/complete workflow
- active-company-member assignee validation
- append-only CRM event history
- database tenant/company/branch/customer/subject scope guards
- explicit `crm.read` / `crm.manage` RBAC permissions and demo owner grants
- CRM cockpit with pipeline, weighted value, conversion and overdue Follow-up metrics
- Lead pool/detail UI with create, search, status/owner filters, qualification and optimistic updates
- governed Opportunity board with explicit allowed stage transitions
- Follow-up Center with create, assignee filter and completion outcome workflow
- optimistic-version guarded Follow-up rescheduling and reason-required cancellation
- database cancellation timestamp/reason invariants and append-only lifecycle events
- `crm.read`-protected minimal active-company assignee directory

Not yet complete:

- standalone Customer -> Opportunity workflow
- Opportunity -> Sale linkage and commercial outcome snapshot
- follow-up notification delivery
- campaign/segment/marketing automation
- unified Customer 360 timeline

### Marketplace

Status: **Publication + public listing foundation + authenticated publication cockpit + public storefront implemented and CI-validated**

Implemented:

- authenticated Marketplace preview with allowlisted business/service projection
- branch-scoped `marketplace_publications` persistence
- explicit publish/unpublish workflow
- publication state read endpoint
- tenant/company/branch validation in service and database trigger
- idempotent publish semantics that preserve the first `publishedAt` while already published
- publication mutations protected by `services.update`
- public listing API: `GET /public/marketplace/:companySlug/:branchCode`
- public API returns data only when publication status is `PUBLISHED`
- unpublished/missing publication does not expose branch/service data
- public response omits internal tenant/company identifiers
- Marketplace preview/public data-leakage regression coverage
- `/marketplace` authenticated branch publication cockpit with public-safe preview, active-service projection and guarded publish/unpublish controls
- public web storefront: `/marketplace/[companySlug]/[branchCode]`
- public storefront consumes only the allowlisted unauthenticated Marketplace API projection
- unpublished/missing storefront resolves to a non-listing state rather than leaking private data
- publication cockpit links directly to the real public storefront only while the branch is published

Validated commits:

- `bd5f8f61b3837db08590f59ce6cd9a32e04163b3` — publication workflow foundation; CI #699 SUCCESS
- `bbe3a41db9918d31717d87318623c72cdbb6f9b6` — published public listings; CI #700 SUCCESS
- `8ae5b05fe50534323de8fc638aac9c64f5359054` — Marketplace publication cockpit; CI #909 SUCCESS
- `a1aa9e04f4b62f31d2b863fcdd3e828d08c5e030` + `8350e29b9a64e68e46559c956ab6f6e467bd7b32` — public storefront + lint correction; CI #913 SUCCESS
- `b2848708bc76429c2db76fb23d9ff56b7376eeb1` — authenticated cockpit → public storefront link; CI #914 SUCCESS

Not yet complete:

- availability engine
- concurrency-safe Marketplace booking
- public API abuse controls/rate limiting/caching policy
- ConsumerAccount
- reviews/favorites
- online payment/deposit/no-show policy

### Supplier Network

Status: **Core identity + platform administration + portal auth + membership + verification foundations + tenant/platform operational UI implemented**

Implemented:

- platform-scoped `supplier_organizations`
- tenant/company-private `inventory_suppliers` preserved
- `supplier_connections` bridge with database-level scope validation
- SupplierConnection scope derives from `TenantContext`, not request-controlled input
- tenant-scoped connection list/upsert API and append-only audit
- explicit platform-admin authorization boundary
- audited platform-admin SupplierOrganization create/update mutations
- supplier memberships/users bounded context separate from ERP membership
- supplier membership role/lifecycle persistence and audit
- supplier verification case/document workflow with single-open-case invariant
- verification decision workflow with organization verification status update + audit
- supplier portal authentication using supplier-specific token type/audience
- supplier portal guard revalidates ACTIVE membership and ACTIVE supplier organization on every request
- supplier portal role authorization foundation (`OWNER` / `ADMIN` / `MEMBER`)
- Supplier isolation/admin/audit/membership/verification/portal-auth regression tests
- `/inventory/supplier-network` tenant/company-scoped operations cockpit
- supplier-network cockpit exposes active connections, local supplier coverage, guarded connection upsert and append-only audit history without crossing the platform-admin boundary
- `/platform/suppliers` platform-admin SupplierOrganization administration surface
- platform-admin UI lists/filters global organizations and supports create/metadata update through the existing `PlatformAdminGuard` protected APIs
- generic SupplierOrganization editing does not expose `verificationStatus`; verification workflow remains the source of truth
- platform-admin UI does not mutate tenant-private `inventory_suppliers`

Validated commits:

- `74d2e08ae58d48d1328ea5b2a56e40d20a21a7bf` + `a58f1bc839f7def6d7052d1ea148218074b334ae` — TenantContext binding; CI #696 SUCCESS
- `b3b731d9ae27489db8c3d28a2d59082a090bed39` — tenant-scoped connection Admin API; CI #701 SUCCESS
- `b14a208462750d8da57818465b9c56493328946b` — SupplierConnection audit trail; CI #702 SUCCESS
- `fe4bc93ab7f8dbe159b749af41b8255f2a30068e` — platform-admin read boundary; descendant CI validated
- `7fac18d2c31faef01a5c4a07ade77b8576fc7ca0` — SupplierMembership foundation; descendant CI validated
- `1c89973bfbb1f9b8aacc4570bccebfa09f8955b9` — SupplierVerification foundation; CI #722 SUCCESS
- `dc9a27d2976d43ee0c8e8730305e3273be2392b9` — Supplier Portal auth foundation; CI #726 SUCCESS
- `f7fb06100de9b1c3f7a3b018423b23361c2b1661` — audited SupplierOrganization mutations; CI #727 SUCCESS
- `97382d15d4af2291930c5f540bfdd6db23c6db08` — tenant Supplier Network cockpit; descendant CI #909 SUCCESS
- `65d4fd4735b66eaf077f8400bb4e784c81a0dd36` — platform SupplierOrganization administration UI; descendant CI #913/#914 SUCCESS

Important boundary:

- `SupplierOrganization` is platform-scoped.
- ordinary tenant RBAC does not grant global supplier administration.
- platform-admin UI still relies on the backend `PlatformAdminGuard`; frontend visibility is not an authorization boundary.
- supplier portal identity/authorization is separate from ERP tenant membership semantics.
- verification state is not directly editable through generic organization update; it remains controlled by the verification workflow.
- platform audit metadata intentionally does not copy raw tax-number values.
- the tenant cockpit does not create or globally administer SupplierOrganization records.
- verification document UX must not expose a user-editable raw `storageKey`; controlled object-storage upload/signing must exist first.

Not yet complete:

- supplier membership invitation / acceptance / self-service onboarding
- supplier portal refresh/revocation session lifecycle
- verification object-storage upload/signing
- public/self-service supplier registration
- brands/catalog
- SupplierOffer
- RFQ/SupplierQuote
- supplier order/fulfillment surface

### Procurement

Status: **Buyer-side request/order + approval + goods receipt + return/replacement operations UI implemented and CI-validated; Supplier Network commercial integration pending**

Implemented:

- private `inventory_suppliers`
- purchase requests
- purchase-request approve + serializable request-to-order conversion
- purchase-order approval lifecycle
- purchase orders/items
- goods receipts
- partial returns/replacements
- inventory movements and stock posting
- SupplierBill / accounts-payable linkage
- accounting guards/reversals
- `/inventory/purchases` buyer operations cockpit with Purchase Request and Purchase Order views
- purchase cockpit metrics for open requests, open orders and open order value
- governed UI actions for:
  - approving a `PENDING` purchase request
  - converting an `APPROVED` request into a Purchase Order with tenant-private supplier and explicit unit cost
  - submitting a `DRAFT` Purchase Order into the approval workflow
  - viewing the multi-level Purchase Order approval state and governed level approve/reject actions
  - moving an `APPROVED` Purchase Order to `ORDERED`
  - performing partial/final Goods Receipt against `ORDERED` Purchase Orders with invoice number, due date and note
- `/inventory/purchases/operations` Goods Receipt + return operations surface
  - branch-scoped Goods Receipt history and item detail
  - per-item received/returned/returnable quantity projection
  - controlled return request creation rather than direct stock mutation from UI
  - `PENDING` return request manager approval/rejection
  - `APPROVED` return execution through the existing stock, SupplierBill, credit-note and journal transaction flow
- `/inventory/purchases/replacements` supplier replacement operations surface
  - purchase-return item detail with already-requested and remaining replacement quantities
  - replacement request creation
  - governed approve/reject lifecycle
  - approved replacement receipt through existing stock, Purchase Order receipt, AP and journal restoration flow
- purchase sub-navigation now exposes request/order, Goods Receipt/return and replacement surfaces without changing the unreconciled global AppShell
- Purchase Order list/detail, approval, ordering, Goods Receipt, return and replacement query paths enforce active branch scope through `warehouse.branch_id` / persisted branch identity
- Purchase Order approval runtime query corrected to derive branch from the warehouse relation rather than a non-existent Purchase Order `branch_id` column
- dedicated branch-safe Procurement Purchase Order query replaces the company-wide Inventory PO list inside the buyer cockpit
- receipt and purchase-return query services provide UI-safe item detail without bypassing mutation services
- regression tests cover approval branch scope, purchase-request branch scope, Purchase Order list branch scope, Goods Receipt detail scope and replacement-quantity scope
- all mutation controls are hidden for users without `inventory.write`
- `ProcurementController` enforces `inventory.read` at controller scope and `inventory.write` on mutations
- `InventoryController` enforces the same read/write boundary across stock, supplier, transfer, accounting-adjustment, asset and cycle-count surfaces
- migration `20260912220000_inventory_procurement_rbac` creates `inventory.read` / `inventory.write` idempotently and grants both to existing `owner` roles
- demo seed includes the same inventory permissions for fresh owner setup

Validated commits:

- `d8bbdfdb0a8dba1c649eb4ef4f8736005d388bfe` — purchase request + Purchase Order cockpit; CI #916 SUCCESS
- `d6d47f80710f6934bfb773dcb7ccaddf88a583fb` — inventory RBAC permission migration; descendant CI #919/#921 SUCCESS
- `8570516d6f53e0fe60246465f8c60a3e086afe16` — Procurement controller permission enforcement; descendant CI #919/#921 SUCCESS
- `8874335602f4092c66c7e279e2dac473136da38c` — demo seed owner inventory grants; CI #919 SUCCESS
- `d6dbc82499edb8cf9521f2e01c3b418f24413be3` — Inventory controller permission enforcement; descendant CI #921 SUCCESS
- `5dc742820e45159559d82c14cb9c0235b8f9b5c8` — governed purchase actions UI; CI #921 SUCCESS
- `7783740932fe856cf2b60af7caf2de3ee50cfe74` + `08c22e29e3196b5ea127902e4aebfafbc475236f` — warehouse-derived approval branch scope + regression coverage; descendant CI #950 SUCCESS
- `51593bba36c4c8e1d241731520d11e80fe1f76b7` + `f1ff86a25c82dbf2aac4634950f0f38c98fae32b` — Purchase Request branch scope + regression coverage; descendant CI #950 SUCCESS
- `5096d4c7bf106eccd1fbbdeeebb29f77b935f87d` — Purchase Order detail / Goods Receipt scope regression coverage; descendant CI #950 SUCCESS
- `9b331dcd462d2391e51d49e7a6542f9a0c347523` + `da76999083362f9f1741c09ad4dc22a84ec96791` — Goods Receipt modal + scoped Purchase Order query wiring; descendant CI #950 SUCCESS
- `13493ec8287203d6d259a23556444ba46d0c39b6` — Goods Receipt history + controlled return operations UI; descendant CI #950 SUCCESS
- `ae2d9db16e0a90e806c5a336306155ac53a1fdf4` — supplier replacement workflow UI; Monorepo quality #950 SUCCESS

Important boundary:

- `inventory.read` and `inventory.write` are application RBAC permissions; tenant/company/branch scope checks remain separately enforced by JWT/TenantContext and service/database invariants.
- request-to-order conversion accepts only tenant/company-private active `inventory_suppliers`; it does not silently substitute a platform SupplierOrganization.
- request conversion remains SERIALIZABLE and locks the purchase request before creating the Purchase Order.
- Purchase Order branch identity is derived from its warehouse; the PO table itself does not own a `branch_id` column.
- Goods Receipt and purchase-return detail APIs are read projections only; stock/AP/accounting mutations remain in existing transaction services.
- return UI creates a governed return request first; approval-role constraints remain backend-authoritative before execution.
- replacement quantity availability subtracts non-rejected replacement requests so overlapping active replacement demand is not presented as available.
- UI permission checks are convenience only; backend `PermissionsGuard` remains authoritative.
- approval-role constraints remain enforced inside `ProcurementApprovalsService`, return-request service and replacement service in addition to `inventory.write`.

Not yet complete:

- Supplier Network offer/quote → buyer procurement conversion
- SupplierOffer
- RFQ/SupplierQuote
- focused browser/E2E coverage for the complete procurement lifecycle

### Healthcare / Dynamic Organization Profiles

Status: **Architecture documented; implementation not started**

Documented:

- Beauty / Clinic / Hospital Ops / Supplier vertical composition
- OrganizationProfile concept
- Capability Engine direction
- RegulatoryProfile / Regulatory Rules Engine direction
- dynamic navigation/workflow policy principle
- Customer vs Patient boundary
- Clinic bounded-context direction
- Hospital Ops integration-first strategy
- biomedical/asset lifecycle direction
- backwards compatibility for existing Beauty tenants

Not yet implemented:

- OrganizationProfile persistence
- capability registry/evaluator
- RegulatoryProfile persistence
- regulatory rule evaluator
- dynamic navigation integration
- organization setup wizard
- PatientProfile / clinical domain
- HealthcareFacility domain
- biomedical asset lifecycle
- healthcare integration hub

## 3. Architecture Decisions Locked In

- `SupplierOrganization` is platform-scoped.
- `inventory_suppliers` remains tenant/company-private.
- `SupplierConnection` bridges the two safely.
- Supplier Portal tokens are distinct from ordinary ERP tenant-context JWT semantics.
- Marketplace publication is explicit opt-in.
- Public Marketplace APIs use allowlisted projections.
- Consumer identity does not automatically equal ERP `Customer` identity.
- Canonical catalog separates product identity from seller offers.
- RFQ is first-class for negotiated/high-value procurement.
- Equipment lifecycle continues after purchase into warranty/maintenance/service.
- Regulated categories require policy-driven eligibility/compliance.
- Organization types are expressed through OrganizationProfile + capabilities + policy, not scattered vertical conditionals.
- Capability checks do not replace RBAC/authorization.
- Customer and Patient/clinical identities remain separate unless explicitly linked.
- Existing Beauty tenants remain backwards compatible.
- Hospital expansion begins with Hospital Ops/integration, not immediate full HBYS replacement.

## 4. Next Execution Queue

### P0 — Frontend release / operations

1. Reconcile the repository AppShell/navigation with the user's latest local Cursor state before adding new global ecosystem navigation items.
2. Link `/marketplace`, `/inventory/supplier-network` and appropriate platform-admin navigation into the reconciled shell without overwriting newer local UI work.
3. Add focused browser/E2E coverage for Purchase Request → approval → order → Goods Receipt → return/replacement lifecycle, including branch-scope denial cases.
4. Add focused browser/E2E coverage for publish/unpublish, public storefront visibility and supplier-connection workflows after route/navigation reconciliation.
5. Add Supplier verification status/case visibility where useful, but do not expose raw storage-key document entry; controlled upload/signing is a prerequisite for document UX.

### P0 — Ecosystem reliability / identity

6. Supplier membership invitation / acceptance / self-service onboarding.
7. Supplier Portal refresh/revocation session lifecycle.
8. Verification document object-storage upload/signing.
9. Public Marketplace operational hardening: rate limiting, caching and abuse controls.
10. Public/self-service supplier registration after invitation/auth boundaries are stable.

### P0-Architecture — Healthcare parallel track

11. H0 OrganizationProfile schema/design review against Tenant/Company/Branch.
12. H1 Capability registry/evaluation contract.
13. H2 RegulatoryProfile/versioning/rule-result model.

Healthcare foundations may progress incrementally but must not weaken the main tenant/RBAC boundaries.

### P1

14. Marketplace availability engine.
15. concurrency-safe Marketplace booking orchestration.
16. Brand + CatalogProduct + ProductVariant + identifiers.
17. SupplierOffer.
18. RFQ + SupplierQuote.
19. Healthcare onboarding/capability prototype after H0-H2 validation.

### P2

20. Procurement conversion from selected offer/quote.
21. ConsumerAccount/reviews/favorites.
22. online payment/deposit/no-show.
23. smart replenishment and contract pricing.
24. equipment/asset/service lifecycle.
25. VALOO Clinic foundation after regulatory/security architecture is ready.

### P3

26. compliance engine extensions.
27. logistics/EDI/API integrations.
28. financing/leasing.
29. supplier intelligence.
30. AI recommendations/concierge.
31. Hospital Ops / Healthcare Integration Hub.

## 5. Current Risk / Release Notes

- Supplier portal refresh/revocation lifecycle is not yet implemented; current access tokens are short-lived (15 minutes) and membership/org state is revalidated per request.
- Supplier invitation/self-service onboarding must not weaken existing user password/authentication guarantees.
- Verification upload must store only controlled object references/metadata in the database, not raw secrets or credentials.
- Dashboard/AppShell remote files are not to be blindly rewritten until the user's newer local Cursor changes are reconciled.
- `/marketplace`, `/inventory/supplier-network` and `/platform/suppliers` are CI-validated operational routes but are intentionally not wired into AppShell yet because of that reconciliation constraint.
- Procurement sub-navigation is intentionally local to `/inventory/purchases`; it adds the new operational surfaces without rewriting the unreconciled global AppShell.
- the public storefront `/marketplace/[companySlug]/[branchCode]` is intentionally outside the authenticated app shell and is reachable only when the backend publication state is `PUBLISHED`.
- non-owner roles that require Inventory/Procurement access must be granted `inventory.read` and, where appropriate, `inventory.write` through Roles & Permissions; lack of a grant now correctly returns `403` rather than inheriting access implicitly.
- Core VALOO ERP UI modernization is substantially complete; remaining UI work is operational coverage, release cleanup/reconciliation and browser-level validation rather than a major redesign phase.
- `main` remains untouched.

## 6. Latest Frontend / Procurement Checkpoint

```text
ae2d9db16e0a90e806c5a336306155ac53a1fdf4
feat(procurement-ui): add supplier replacement workflow

Monorepo quality #950 — SUCCESS
```

The successful descendant includes:

- inventory/Procurement `inventory.read` / `inventory.write` RBAC hardening
- Purchase Request branch-scope enforcement and regression coverage
- warehouse-derived Purchase Order approval branch scope
- multi-level Purchase Order approval drill-down/actions
- branch-safe Procurement Purchase Order list/detail queries
- Goods Receipt modal with partial receipt quantities, invoice metadata and existing transactional posting
- Goods Receipt history + item-level returnable quantity projection
- governed return request create/approve/reject/execute UI
- purchase-return item replacement-availability projection
- governed replacement create/approve/reject/receive UI
- purchase-local navigation for request/order, receipt/return and replacement surfaces

Quality gate passed dependency install, fresh PostgreSQL migration deployment, database/shared/API checks, all API tests, API build, web lint, web typecheck and web production build.

## 7. CI Status Rule

Never state that an increment has passed CI unless GitHub exposes a successful workflow for the exact relevant commit or a direct descendant containing it.

## 8. Status Update Template

```text
Feature:
Status:
Files/migrations:
Invariants covered:
Tests:
Commit:
CI/checks:
Remaining risks:
Next step:
```
