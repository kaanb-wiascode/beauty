# VALOO — Implementation Status

> Purpose: evidence-based implementation tracker.
> Update this file when Marketplace/Supplier/Procurement or Healthcare ecosystem code materially changes.

## 1. Current Branch

`feature/core-commerce-foundation`

Do not merge/push to `main` without explicit approval.

## 2. Current Implemented Foundations

### Marketplace

Status: **Publication foundation prepared; branch attachment/CI validation pending**

Implemented/prepared:

- `apps/api/src/modules/marketplace/marketplace.module.ts`
- `apps/api/src/modules/marketplace/marketplace.controller.ts`
- `apps/api/src/modules/marketplace/marketplace.service.ts`
- module registered in `AppModule`
- authenticated marketplace preview endpoint foundation
- preview uses allowlisted business/service projection rather than exposing raw ERP entities
- persistent branch-scoped `marketplace_publications` migration prepared
- explicit publish/unpublish workflow prepared
- publication state read endpoint prepared
- tenant/company/branch scope validation in service and database trigger
- idempotent publish semantics that preserve first `publishedAt` while already published
- publication mutations protected by existing `services.update` permission

Not yet complete:

- attach prepared MarketplacePublication commit to active branch and validate CI
- public marketplace endpoint
- public slug/routing model
- availability engine
- concurrency-safe marketplace booking
- ConsumerAccount
- reviews/favorites
- online payment/deposit

### Supplier Network

Status: **Core identity foundation started; tenant scope hardened**

Implemented:

- platform-scoped `supplier_organizations`
- `supplier_connections`
- connection to existing tenant/company-private `inventory_suppliers`
- database-level tenant/company scope validation guard
- `apps/api/src/modules/supplier-network/` module/service foundation
- Supplier Network module registered in `AppModule`
- Marketplace/Supplier regression tests for isolation invariants
- SupplierConnection tenant/company context now derives from `TenantContext`, not request-controlled input

Initial organization types:

- MANUFACTURER
- DISTRIBUTOR
- IMPORTER
- WHOLESALER
- RETAILER
- SERVICE_PROVIDER
- OTHER

Initial verification states:

- UNVERIFIED
- PENDING
- VERIFIED
- REJECTED
- SUSPENDED

Not yet complete:

- explicit platform-admin authorization boundary for global SupplierOrganization administration
- tenant-scoped SupplierConnection admin API + RBAC
- supplier memberships/users
- verification case/document workflow
- Supplier Portal
- public/self-service supplier registration
- brands/catalog
- SupplierOffer
- RFQ/SupplierQuote
- supplier order/fulfillment surface

### Procurement

Status: **Existing mature buyer-side foundation; integration pending**

Existing code already contains buyer-side procurement services and migrations including:

- private `inventory_suppliers`
- purchase requests
- purchase-order approval lifecycle
- purchase orders/items
- goods receipts
- partial returns/replacements
- inventory movements and stock posting
- SupplierBill / accounts-payable linkage
- accounting-related guards/reversals

Supplier Network must integrate into this domain without replacing it.

### Healthcare / Dynamic Organization Profiles

Status: **Architecture documented; implementation not started**

Documented:

- organization classification direction
- Beauty / Clinic / Hospital Ops / Supplier vertical composition
- OrganizationProfile concept
- Capability Engine contract direction
- RegulatoryProfile and Regulatory Rules Engine direction
- dynamic navigation/workflow policy principle
- Customer vs Patient boundary
- Clinic bounded-context direction
- Hospital Ops integration-first strategy
- asset/biomedical equipment direction
- backward-compatibility rule for existing Beauty tenants
- parallel healthcare roadmap H0-H9

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
- Public marketplace APIs use allowlisted projections.
- Consumer identity will not automatically equal ERP `Customer` identity.
- Canonical catalog separates product identity from seller offers.
- RFQ is first-class for negotiated/high-value procurement.
- Equipment lifecycle continues after purchase into warranty/maintenance/service.
- Regulated categories require policy-driven eligibility/compliance.
- Organization types are expressed through OrganizationProfile + capabilities + policy, not scattered `if clinic/hospital` branches.
- Capability checks do not replace RBAC/authorization.
- Customer and Patient/clinical identity are separate concepts unless explicitly linked.
- Existing Beauty tenants must remain backwards compatible.
- Hospital expansion begins with Hospital Ops/integration, not immediate full HBYS replacement.
- Growth/marketing is not current technical priority.

## 4. Next Execution Queue

### P0 — Existing Main Roadmap

1. Attach/validate MarketplacePublication migration/workflow and add public-safe listing endpoint.
2. Extend Marketplace authorization/data-leakage coverage for the future public boundary.
3. Define platform-admin authorization boundary for global SupplierOrganization administration.
4. Add tenant-scoped SupplierConnection admin API with RBAC.
5. SupplierOrganization audit events/history.
6. SupplierMembership + SupplierVerification design and migration.

### P0-Architecture — Healthcare Parallel Track

7. H0 OrganizationProfile schema/design review against existing Tenant/Company/Branch model.
8. H1 Capability registry/evaluation contract design.
9. H2 RegulatoryProfile/versioning/rule-result data model design.

These healthcare foundation items may progress incrementally but must not block the main P0 reliability and ecosystem queue.

### P1

10. Availability engine foundation.
11. concurrency-safe marketplace booking orchestration.
12. Brand + CatalogProduct + ProductVariant + identifiers.
13. SupplierOffer.
14. RFQ + SupplierQuote.
15. Healthcare onboarding/capability prototype only after H0-H2 design is validated.

### P2

16. Procurement conversion from selected offer/quote.
17. ConsumerAccount/reviews/favorites.
18. payment/deposit/no-show.
19. smart replenishment and contract pricing.
20. equipment/asset/service lifecycle.
21. VALOO Clinic foundation after security/regulatory architecture is ready.

### P3

22. compliance engine extensions.
23. logistics/EDI/API integrations.
24. financing/leasing.
25. supplier intelligence.
26. AI recommendations/concierge.
27. Hospital Ops / Healthcare Integration Hub.

## 5. Evidence / Commit Log

Known ecosystem foundation commits:

- `a46b3b9f3b0b6b154221df04bd97776b6c2c9a9b` — Marketplace module registered in API application.
- `0891c7d8784ae83aab632317073a852d9959d1a6` — Supplier Network foundation and application registration sequence.
- `c9ad805a3aa8fad6e5e56728ecdcdef4b279248f` — Marketplace preview isolation regression tests.
- `c3386e9cc58418adf61c3b989867e411014f0710` — Supplier Network scope invariant regression tests.
- `74d2e08ae58d48d1328ea5b2a56e40d20a21a7bf` — SupplierConnection scope bound to TenantContext.
- `a58f1bc839f7def6d7052d1ea148218074b334ae` — Supplier tenant-context regression tests; CI #696 success.
- `8e1a278e5201fb8c45405078c69e707b51889b7a` — MarketplacePublication migration/workflow commit prepared through Git data; active branch attachment/CI not yet observed.
- `6e2869a8ab7ff5ef32f255af2eeadca1b65f95b9` — Healthcare capability/regulatory architecture document added.
- `4d8b2ae98a8ef34f1d4df2708c8a1dceeacfc050` — Healthcare expansion roadmap added.

## 6. CI Status Rule

Never state that an increment has passed CI unless GitHub exposes a successful check/workflow for the exact relevant commit. If no checks are returned, record the state as **CI not observed**, not passed.

## 7. Status Update Template

When completing a future increment, append or update:

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
