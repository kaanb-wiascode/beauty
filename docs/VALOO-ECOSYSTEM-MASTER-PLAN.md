# VALOO — Ecosystem Master Plan

> Status: Canonical product and delivery baseline
> Product: VALOO
> Scope: Business ERP, Consumer Marketplace, Supplier Network and Procurement ecosystem
> Branch policy: development continues on `feature/core-commerce-foundation`; do not merge or push to `main` without explicit approval.

## 1. Purpose

This document is the product-level source of truth for VALOO's ecosystem expansion. It records the decisions already made for Marketplace, Supplier Network and Procurement and defines how future implementation decisions are governed.

Detailed technical contracts live in `MARKETPLACE-SUPPLIER-PROCUREMENT-ARCHITECTURE.md`. Delivery order and milestones live in `roadmap/VALOO-MARKETPLACE-SUPPLIER-ROADMAP.md`. Current implementation state lives in `roadmap/VALOO-IMPLEMENTATION-STATUS.md`.

## 2. Product Vision

VALOO is not intended to remain only a salon appointment application or a conventional ERP. The target product is a sector operating system for beauty, wellness, aesthetics and adjacent healthcare/service businesses.

The ecosystem has four product surfaces:

1. **VALOO Business** — tenant/company/branch scoped ERP and operating system.
2. **VALOO Marketplace** — consumer discovery, availability and booking surface.
3. **VALOO Supply** — B2B procurement marketplace connecting buyers to suppliers.
4. **VALOO Supplier** — supplier operating portal for identity, verification, catalog, offers, RFQs, orders and after-sales operations.

Shared platform capabilities may later include Identity, Payments, Commerce, Logistics, Compliance, Data and AI.

## 3. Core Business Loop

VALOO Business remains the system of record for buyer operations:

```text
Customer -> Appointment -> Service -> Package/Sale -> Payment -> Inventory -> Accounting
```

The consumer Marketplace extends the front of this loop:

```text
Consumer Search -> Business Discovery -> Availability -> Booking -> ERP Appointment
```

The Supplier Network and Procurement extend the supply side:

```text
Demand / Reorder Need -> RFQ / Offer -> Purchase Order -> Goods Receipt -> Inventory -> Supplier Bill -> Accounting
```

The objective is not to build disconnected marketplaces. Marketplace and Supply must create transactions that land in the same trusted ERP domains.

## 4. VALOO Marketplace Decisions

### 4.1 Position

Marketplace is a separate consumer-facing product surface built on top of the ERP domain, not an ERP page exposed publicly.

### 4.2 Initial Consumer Journey

```text
Search service/location
  -> discover businesses
  -> open public business profile
  -> inspect services/prices
  -> inspect real availability
  -> select service/staff/time
  -> book
  -> appointment appears in VALOO Business
```

### 4.3 Marketplace V1 Scope

Initial production scope:

- explicit marketplace publication by business/branch,
- public business profile,
- public service catalog,
- location/search filters,
- real availability,
- booking,
- safe synchronization into ERP appointments.

Do not block V1 on reviews, favorites, promotions, AI, loyalty or advanced payments.

### 4.4 Marketplace Expansion

After core booking is stable:

- ConsumerAccount,
- reservation history,
- favorites,
- verified reviews,
- online payment/deposit,
- cancellation/no-show policies,
- promotions/coupons,
- loyalty,
- sponsored discovery,
- personalized recommendations,
- AI concierge.

### 4.5 Availability and Booking Are Critical Infrastructure

The most important Marketplace engine is not the profile page; it is availability and concurrency-safe booking.

Availability may eventually consider:

- branch opening hours,
- service duration,
- eligible staff,
- staff schedule/shift,
- leave/breaks,
- existing appointments,
- rooms/resources/equipment,
- capacity,
- booking buffers,
- marketplace-specific rules.

Double booking must be prevented with database-backed concurrency guarantees. UI checks alone are insufficient.

### 4.6 Publication Rule

Marketplace publication is always explicit opt-in. Private ERP data must never become public simply because a business exists in VALOO.

Only allowlisted public projections may be returned to public APIs.

## 5. Supplier Network Decisions

### 5.1 Supplier Network Is Platform-Scoped

A supplier can participate in VALOO even if it is not an ERP tenant.

Supplier categories may include:

- professional cosmetics,
- salon/hairdressing products,
- nail/lash/brow products,
- disposables and hygiene,
- uniforms/textiles,
- furniture,
- beauty/aesthetic equipment,
- medical devices,
- spare parts and consumables,
- technical service,
- training/certification,
- software/technology,
- packaging,
- logistics,
- financing/leasing,
- other permitted B2B services and products.

Regulated products require separate compliance rules and must not be treated as ordinary open-market goods.

### 5.2 SupplierOrganization vs inventory_suppliers

These are intentionally different concepts:

- `SupplierOrganization` = platform-wide supplier identity.
- `inventory_suppliers` = a buyer tenant/company's private vendor card.

They are connected through `SupplierConnection`.

A global supplier identity never grants access to the buyer's private financial, procurement, inventory or customer data.

### 5.3 Supplier Verification

Supplier onboarding must support a verification lifecycle before unrestricted marketplace participation.

Initial verification states:

- UNVERIFIED
- PENDING
- VERIFIED
- REJECTED
- SUSPENDED

Future verification may include company identity, tax data, licenses, distributor/manufacturer authorizations, facility eligibility and category-specific documents.

### 5.4 Supplier Portal

Supplier Portal should ultimately support:

- organization profile,
- users/memberships/roles,
- locations,
- verification documents,
- brands,
- catalogs,
- offers and contract prices,
- stock/availability feeds,
- RFQ inbox,
- quotes,
- orders,
- shipping/fulfillment,
- returns,
- invoices/settlement visibility where permitted,
- warranties,
- installation/training,
- technical service,
- analytics.

Public self-registration should not be opened before identity, verification and authorization foundations exist.

## 6. Canonical Catalog Decision

VALOO must avoid creating a duplicate product record for every seller.

Target model:

```text
CatalogProduct
  -> ProductIdentifier
  -> ProductVariant
  -> SupplierOffer A
  -> SupplierOffer B
  -> SupplierOffer C
```

Shared facts belong to the canonical product. Seller-specific facts belong to `SupplierOffer`.

Typical canonical facts:

- manufacturer,
- brand,
- model/product name,
- GTIN/manufacturer code,
- technical specifications,
- regulatory identifiers where applicable,
- pack/variant identity.

Typical offer facts:

- seller,
- price/currency,
- minimum order quantity,
- stock/availability,
- delivery lead time,
- payment terms,
- territory,
- validity window,
- contract pricing eligibility.

## 7. Procurement Decisions

Existing Procurement remains buyer-side and tenant/company scoped. It must not be replaced by Supplier Network.

Current/target procurement chain:

```text
Purchase Request
  -> Approval
  -> RFQ / Offer Selection
  -> Purchase Order
  -> Goods Receipt
  -> Inventory
  -> Supplier Bill / AP
  -> Accounting
```

Supplier Network supplies identity, catalog, offers and quotes. Procurement owns the buyer's legally/auditably relevant transaction facts.

## 8. RFQ as a First-Class Product

RFQ is a core feature, especially for high-value or configurable purchases such as laser systems, medical devices, MR/imaging equipment, furniture, technical services, implementation, training and bulk institutional procurement.

Target flow:

```text
PurchaseRequest
  -> RFQ
  -> eligible/invited suppliers
  -> SupplierQuote(s)
  -> QuoteComparison
  -> Award
  -> PurchaseOrder
```

Comparison dimensions should support more than price:

- currency,
- delivery time,
- warranty,
- installation,
- training,
- service SLA,
- payment terms,
- financing,
- return terms.

## 9. Smart Procurement

A strategic differentiator is to convert ERP operational data into purchasing decisions.

Planned capabilities:

- reorder point suggestions,
- consumption-based demand forecasting,
- minimum/maximum stock policies,
- automatic purchase recommendations,
- contract-price comparison,
- supplier lead-time comparison,
- landed-cost comparison,
- approved-vendor rules,
- group purchasing,
- AI-assisted supplier recommendation.

Example target behavior:

```text
Inventory consumption
  -> predicted shortage
  -> recommended quantity
  -> eligible SupplierOffers / contracts
  -> suggested purchase or RFQ
```

Automatic ordering should not be enabled until approvals, budgets, idempotency and exception handling are mature.

## 10. Equipment and Asset Lifecycle

High-value devices must continue beyond purchase into an equipment lifecycle.

Target entities/capabilities:

- Asset / Equipment,
- manufacturer/model,
- serial number,
- purchase origin,
- assigned branch/location,
- installation,
- warranty,
- maintenance plan,
- usage counters where available,
- service history,
- failure/incident history,
- spare parts,
- consumables,
- calibration where applicable,
- replacement/disposal.

Supplier Network should later connect buyers to authorized technical-service providers and spare-part offers.

## 11. Compliance and Traceability

Regulated categories must use policy-driven eligibility.

Architecture must be able to support:

- seller authorization,
- buyer/facility eligibility,
- professional eligibility when applicable,
- product/device class,
- UTS or equivalent identifiers where applicable,
- GTIN,
- lot/batch,
- serial number,
- expiry date,
- recall/field-safety actions,
- audit trail.

The existence of a SupplierOffer never by itself implies that a product may legally be sold to every buyer.

## 12. Commercial Extensions — Later, Not Current Priority

Possible future monetization surfaces include:

- ERP subscriptions,
- marketplace customer-acquisition fees,
- payment fees,
- supplier subscriptions,
- B2B transaction/commission fees,
- promoted listings,
- premium supplier profiles,
- supplier analytics/intelligence,
- messaging packages,
- financing/leasing referrals.

Commercial growth optimization is explicitly secondary to establishing reliable technical foundations.

## 13. Data and Intelligence

Supplier intelligence may eventually provide privacy-safe aggregate insights such as:

- regional category demand,
- category growth,
- repeat-order behavior,
- product penetration,
- aggregate stock-turn trends,
- campaign performance.

Never expose one tenant's private commercial data, another supplier's confidential offer terms or identifiable customer data without proper authorization.

## 14. Architectural Invariants

Every implementation must preserve these invariants:

1. Tenant/company/branch isolation remains mandatory.
2. Platform identities do not bypass tenant authorization.
3. Public APIs expose explicit projections only.
4. Financial and inventory transactions are auditable and reversible when business rules permit.
5. Idempotency is required for external callbacks and retried transaction creation.
6. Concurrency must be enforced at the database/transaction layer for scarce resources and financial state transitions.
7. Marketplace and Supplier Network must integrate with existing domains instead of duplicating their systems of record.
8. Secrets/API credentials are encrypted and never exposed in API responses or logs.
9. No internet-banking usernames/passwords are collected or stored.
10. Regulated sales require category-specific compliance rules.

## 15. Scope Discipline

VALOO must avoid the failure mode of becoming a feature-heavy but difficult ERP.

Rules:

- add bounded capabilities incrementally,
- prefer stable core transaction flows before breadth,
- keep advanced complexity behind progressive UX,
- do not duplicate existing services, tables, migrations or endpoints,
- verify current code before every implementation,
- keep consumer, supplier and buyer identities separated where their authorization boundaries differ.

## 16. Delivery Priority

The current priority is technical foundation, not marketplace growth.

Order of work:

1. protect/complete ERP core reliability,
2. Marketplace publication and safe public projection,
3. SupplierOrganization and SupplierConnection foundation,
4. Supplier identity/membership/verification,
5. Marketplace availability + booking foundation,
6. canonical product catalog + SupplierOffer,
7. RFQ + SupplierQuote,
8. Procurement integration with selected offer/quote,
9. consumer accounts/reviews/favorites/payments,
10. smart replenishment/contract pricing,
11. equipment/asset lifecycle + technical service,
12. compliance/logistics/financing/intelligence extensions.

The detailed milestone checklist is maintained in `docs/roadmap/VALOO-MARKETPLACE-SUPPLIER-ROADMAP.md`.

## 17. Documentation Governance

For Marketplace/Supplier/Procurement work:

- Product decision -> update this Master Plan.
- Domain/entity/invariant decision -> update `MARKETPLACE-SUPPLIER-PROCUREMENT-ARCHITECTURE.md`.
- Development sequence/milestone -> update the roadmap.
- Implemented/verified state -> update implementation status.
- API/database conventions continue to follow the existing canonical `/docs` conventions.

A code change is not considered fully documented when it materially changes one of these product/domain contracts but the relevant document is not updated.
