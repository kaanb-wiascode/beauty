# VALOO — Implementation Status

> Purpose: evidence-based implementation tracker.
> Update this file when Marketplace/Supplier/Procurement or Healthcare ecosystem code materially changes.

## 1. Current Branch

`feature/core-commerce-foundation`

Do not merge/push to `main` without explicit approval.

## 2. Current Implemented Foundations

### Marketplace

Status: **Publication + public listing foundation implemented and CI-validated**

Implemented:

- authenticated Marketplace preview with allowlisted business/service projection
- branch-scoped `marketplace_publications` persistence
- explicit publish/unpublish workflow
- publication state read endpoint
- tenant/company/branch validation in service and database trigger
- idempotent publish semantics that preserve the first `publishedAt` while already published
- publication mutations protected by `services.update`
- public listing route: `GET /public/marketplace/:companySlug/:branchCode`
- public route returns data only when publication status is `PUBLISHED`
- unpublished/missing publication does not read branch/service data
- public response omits internal tenant/company identifiers
- Marketplace preview/public data-leakage regression coverage

Validated commits:

- `bd5f8f61b3837db08590f59ce6cd9a32e04163b3` — publication workflow foundation; CI #699 SUCCESS
- `bbe3a41db9918d31717d87318623c72cdbb6f9b6` — published public listings; CI #700 SUCCESS

Not yet complete:

- availability engine
- concurrency-safe Marketplace booking
- public API abuse controls/rate limiting/caching policy
- ConsumerAccount
- reviews/favorites
- online payment/deposit/no-show policy

### Supplier Network

Status: **Core identity + scoped administration + membership + verification foundations implemented**

Implemented:

- platform-scoped `supplier_organizations`
- tenant/company-private `inventory_suppliers` preserved
- `supplier_connections` bridge
- database-level tenant/company scope validation guard
- SupplierConnection tenant/company scope derives from `TenantContext`, not request-controlled input
- tenant-scoped connection list/upsert API
- append-only SupplierConnection audit trail
- explicit platform-admin authorization boundary for global SupplierOrganization read access
- supplier memberships/users bounded context separate from ERP membership
- supplier membership role/lifecycle persistence and audit
- supplier verification case/document workflow
- single-open-case invariant per supplier organization
- verification decision workflow with organization verification status update + audit
- Supplier isolation/admin/audit/membership/verification regression tests

Validated commits:

- `74d2e08ae58d48d1328ea5b2a56e40d20a21a7bf` + `a58f1bc839f7def6d7052d1ea148218074b334ae` — TenantContext binding; CI #696 SUCCESS
- `b3b731d9ae27489db8c3d28a2d59082a090bed39` — tenant-scoped connection Admin API; CI #701 SUCCESS
- `b14a208462750d8da57818465b9c56493328946b` — SupplierConnection audit trail; CI #702 SUCCESS
- `fe4bc93ab7f8dbe159b749af41b8255f2a30068e` — platform-admin read boundary; descendant CI validated
- `7fac18d2c31faef01a5c4a07ade77b8576fc7ca0` — SupplierMembership foundation; descendant CI validated
- `1c89973bfbb1f9b8aacc4570bccebfa09f8955b9` — SupplierVerification foundation; CI #722 SUCCESS

Important boundary:

- `SupplierOrganization` is platform-scoped.
- ordinary tenant RBAC does not grant global supplier administration.
- supplier portal identity/authorization is separate from ERP tenant membership semantics.

Not yet complete:

- Supplier Portal authentication/authorization foundation
- supplier membership invitation / acceptance flow
- verification object-storage upload/signing
- audited SupplierOrganization create/update mutations
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

### P0 — Ecosystem reliability / identity

1. Supplier Portal authentication/authorization foundation.
2. Audited SupplierOrganization create/update mutations under platform-admin boundary.
3. Supplier membership invitation / acceptance / self-service onboarding.
4. Verification document object-storage upload/signing.
5. Public Marketplace operational hardening: rate limiting, caching and abuse controls.

### P0-Architecture — Healthcare parallel track

6. H0 OrganizationProfile schema/design review against Tenant/Company/Branch.
7. H1 Capability registry/evaluation contract.
8. H2 RegulatoryProfile/versioning/rule-result model.

Healthcare foundations may progress incrementally but must not weaken the main tenant/RBAC boundaries.

### P1

9. Marketplace availability engine.
10. concurrency-safe Marketplace booking orchestration.
11. Brand + CatalogProduct + ProductVariant + identifiers.
12. SupplierOffer.
13. RFQ + SupplierQuote.
14. Healthcare onboarding/capability prototype after H0-H2 validation.

### P2

15. Procurement conversion from selected offer/quote.
16. ConsumerAccount/reviews/favorites.
17. online payment/deposit/no-show.
18. smart replenishment and contract pricing.
19. equipment/asset/service lifecycle.
20. VALOO Clinic foundation after regulatory/security architecture is ready.

### P3

21. compliance engine extensions.
22. logistics/EDI/API integrations.
23. financing/leasing.
24. supplier intelligence.
25. AI recommendations/concierge.
26. Hospital Ops / Healthcare Integration Hub.

## 5. Current Risk / Release Notes

- Supplier portal auth must remain separate from ordinary tenant JWT/membership semantics.
- Global SupplierOrganization mutations require platform-admin audit before exposure.
- Dashboard/AppShell remote files are not to be blindly rewritten until the user's newer local Cursor changes are reconciled.
- Core VALOO ERP UI modernization is substantially complete; remaining UI work is release cleanup/reconciliation rather than a major redesign phase.
- `main` remains untouched.

## 6. CI Status Rule

Never state that an increment has passed CI unless GitHub exposes a successful workflow for the exact relevant commit or a direct descendant containing it.

## 7. Status Update Template

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
