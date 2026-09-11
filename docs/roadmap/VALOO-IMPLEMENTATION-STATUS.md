# VALOO — Marketplace + Supplier Implementation Status

> Purpose: evidence-based implementation tracker.
> Update this file when Marketplace/Supplier/Procurement ecosystem code materially changes.

## 1. Current Branch

`feature/core-commerce-foundation`

Do not merge/push to `main` without explicit approval.

## 2. Current Implemented Foundations

### Marketplace

Status: **Foundation started**

Implemented:

- `apps/api/src/modules/marketplace/marketplace.module.ts`
- `apps/api/src/modules/marketplace/marketplace.controller.ts`
- `apps/api/src/modules/marketplace/marketplace.service.ts`
- module registered in `AppModule`
- authenticated marketplace preview endpoint foundation
- preview uses allowlisted business/service projection rather than exposing raw ERP entities

Not yet complete:

- persistent publication model
- publish/unpublish workflow
- public marketplace endpoint
- availability engine
- concurrency-safe marketplace booking
- ConsumerAccount
- reviews/favorites
- online payment/deposit

### Supplier Network

Status: **Core identity foundation started**

Implemented:

- platform-scoped `supplier_organizations`
- `supplier_connections`
- connection to existing tenant/company-private `inventory_suppliers`
- database-level tenant/company scope validation guard
- `apps/api/src/modules/supplier-network/` module/service foundation
- Supplier Network module registered in `AppModule`

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
- Growth/marketing is not current technical priority.

## 4. Next Execution Queue

### P0

1. MarketplacePublication persistence and publish/unpublish workflow.
2. Marketplace authorization + data-leakage tests.
3. Supplier Network admin API with RBAC.
4. SupplierOrganization audit events/history.
5. SupplierMembership + SupplierVerification design and migration.

### P1

6. Availability engine foundation.
7. concurrency-safe marketplace booking orchestration.
8. Brand + CatalogProduct + ProductVariant + identifiers.
9. SupplierOffer.
10. RFQ + SupplierQuote.

### P2

11. Procurement conversion from selected offer/quote.
12. ConsumerAccount/reviews/favorites.
13. payment/deposit/no-show.
14. smart replenishment and contract pricing.
15. equipment/asset/service lifecycle.

### P3

16. compliance engine extensions.
17. logistics/EDI/API integrations.
18. financing/leasing.
19. supplier intelligence.
20. AI recommendations/concierge.

## 5. Evidence / Commit Log

Known ecosystem foundation commits:

- `a46b3b9f3b0b6b154221df04bd97776b6c2c9a9b` — Marketplace module registered in API application.
- `0891c7d8784ae83aab632317073a852d9959d1a6` — Supplier Network foundation and application registration sequence.
- documentation baseline commits are tracked through Git history on this branch.

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
