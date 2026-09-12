# VALOO — Implementation Status

> Purpose: evidence-based implementation tracker.
> Update this file when Marketplace/Supplier/Procurement or Healthcare ecosystem code materially changes.

## 1. Current Branch

`feature/core-commerce-foundation`

Do not merge/push to `main` without explicit approval.

## 2. Current Implemented Foundations

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

Status: **Existing mature buyer-side foundation; Supplier Network integration pending**

Existing buyer-side capabilities include:

- private `inventory_suppliers`
- purchase requests
- purchase-order approval lifecycle
- purchase orders/items
- goods receipts
- partial returns/replacements
- inventory movements and stock posting
- SupplierBill / accounts-payable linkage
- accounting guards/reversals

Supplier Network must integrate into this domain without replacing it.

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

1. Reconcile the repository AppShell/navigation with the user's latest local Cursor state before adding new ecosystem navigation items.
2. Link `/marketplace`, `/inventory/supplier-network` and appropriate platform-admin navigation into the reconciled shell without overwriting newer local UI work.
3. Continue buyer-side procurement operational coverage using existing governed Purchase Request / Purchase Order / Goods Receipt APIs.
4. Add Supplier verification status/case visibility where useful, but do not expose raw storage-key document entry; controlled upload/signing is a prerequisite for document UX.
5. Add focused browser/E2E coverage for publish/unpublish, public storefront visibility and supplier-connection workflows after route/navigation reconciliation.

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
- the public storefront `/marketplace/[companySlug]/[branchCode]` is intentionally outside the authenticated app shell and is reachable only when the backend publication state is `PUBLISHED`.
- Core VALOO ERP UI modernization is substantially complete; remaining UI work is operational coverage, release cleanup/reconciliation and browser-level validation rather than a major redesign phase.
- `main` remains untouched.

## 6. Latest Frontend Checkpoint

```text
b2848708bc76429c2db76fb23d9ff56b7376eeb1
feat(marketplace-ui): link public storefront

Monorepo quality #914 — SUCCESS
```

The successful checkpoint includes:

- `97382d15d4af2291930c5f540bfdd6db23c6db08` — `/inventory/supplier-network` tenant operations cockpit
- `8ae5b05fe50534323de8fc638aac9c64f5359054` — `/marketplace` authenticated publication cockpit
- `65d4fd4735b66eaf077f8400bb4e784c81a0dd36` — `/platform/suppliers` platform-admin organization management
- `a1aa9e04f4b62f31d2b863fcdd3e828d08c5e030` + `8350e29b9a64e68e46559c956ab6f6e467bd7b32` — `/marketplace/[companySlug]/[branchCode]` public storefront
- `b2848708bc76429c2db76fb23d9ff56b7376eeb1` — publication cockpit → real public storefront link

Quality gate passed frozen dependency install, fresh PostgreSQL migration deployment, database/shared/API checks, all API tests, API build, web lint, web typecheck and web production build.

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
