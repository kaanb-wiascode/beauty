# VALOO — Marketplace + Supplier Network + Procurement Architecture

> Status: Canonical domain architecture baseline
> Scope: VALOO Marketplace, Supplier Network, buyer-side Procurement and their integration with the existing ERP domains.
> Product scope authority: `VALOO-ECOSYSTEM-MASTER-PLAN.md`
> Delivery authority: `roadmap/VALOO-MARKETPLACE-SUPPLIER-ROADMAP.md`
> Current implementation evidence: `roadmap/VALOO-IMPLEMENTATION-STATUS.md`

## 0. Architecture Governance

This document owns bounded-context responsibility, entity ownership, trust boundaries, integration boundaries and domain invariants for Marketplace, Supplier Network and Procurement.

When a product idea changes what VALOO should do, update the Master Plan. When it changes which domain owns data or how domains interact, update this document. When it changes delivery order, update the roadmap. When code is actually implemented, update Implementation Status.

Legacy references to “Beauty ERP” elsewhere in the repository are historical naming; the current product name is **VALOO**.

## 1. Objective

VALOO evolves from a tenant-scoped beauty/wellness ERP into an ecosystem with three connected but independently governed bounded contexts:

1. **Marketplace** — consumer discovery, public business profiles, availability and bookings.
2. **Supplier Network** — platform-level supplier identity, verification, catalog participation and commercial presence.
3. **Procurement** — tenant/company-scoped purchasing, approvals, purchase orders, goods receipts, returns, accounts payable and inventory posting.

The architecture must preserve existing tenant/company/branch isolation. Platform-wide supplier identity must never make tenant-private procurement, pricing, finance or inventory data globally visible.

## 2. Core Architectural Rule

`SupplierOrganization` and the existing `inventory_suppliers` table represent different concepts.

- `SupplierOrganization`: platform-level identity of a manufacturer, distributor, importer, wholesaler, service company or other supplier.
- `inventory_suppliers`: a buyer tenant/company's private vendor card used by Procurement and Accounts Payable.

A buyer may connect its private vendor card to a verified `SupplierOrganization`, but the private card remains company-scoped.

```text
SupplierOrganization (platform)
        |
        | optional verified connection
        v
SupplierConnection
        |
        v
inventory_suppliers (tenant/company private vendor card)
        |
        +--> Purchase Order
        +--> Goods Receipt
        +--> Supplier Bill / AP
```

## 3. Bounded Contexts

### 3.1 Marketplace

Owns:
- PublicBusinessProfile
- MarketplacePublication
- PublicServiceListing
- ConsumerAccount (future)
- Favorite (future)
- Review (future)
- MarketplaceBooking orchestration (future)

Does not own tenant-private CRM, staff HR, finance or accounting data.

Marketplace reads operational truth through explicit projections/services. It does not expose raw tenant entities directly.

### 3.2 Supplier Network

Owns:
- SupplierOrganization
- SupplierLocation (future)
- SupplierMembership / SupplierUser (future)
- SupplierVerification (future)
- SupplierDocument / ComplianceDocument (future)
- Brand (future)
- Catalog participation (future)
- SupplierOffer (future)
- ServiceCapability (future: installation, maintenance, training)

Supplier Network is platform-scoped and is not subordinate to one ERP tenant.

### 3.3 Procurement

Existing buyer-side domain remains tenant/company scoped and owns:
- PurchaseRequest
- approval workflow
- inventory_suppliers private vendor cards
- PurchaseOrder
- GoodsReceipt
- PurchaseReturn
- SupplierBill / Accounts Payable linkage
- Inventory posting
- Accounting posting

Procurement consumes supplier-network identity and offers but must persist the contractual buyer-side facts required for auditability.

## 4. Identity and Trust Boundaries

VALOO has multiple identity domains that must not be collapsed accidentally:

```text
ERP Business User / Membership
Consumer Identity
Supplier User / SupplierMembership
Platform/Admin Identity
```

A person may later hold more than one relationship, but authorization is evaluated in the active domain/context.

Rules:

- Consumer authentication does not grant ERP tenant access.
- Supplier authentication does not grant buyer tenant access.
- A `SupplierConnection` is a commercial identity link, not an authorization grant.
- ERP `Customer` and Marketplace `ConsumerAccount` are not automatically the same entity.
- Any linking workflow must be explicit, auditable and privacy-safe.

## 5. High-Level Flow

```text
Consumer                        Business / Buyer                      Supplier
   |                                  |                                  |
   |---- Marketplace booking -------->|                                  |
   |                                  |                                  |
   |                                  |---- RFQ / Purchase Request ------>|
   |                                  |<--- Quote / Offer ----------------|
   |                                  |                                  |
   |                                  |---- Purchase Order -------------->|
   |                                  |<--- Shipment / Delivery ----------|
   |                                  |                                  |
   |                                  +--> Goods Receipt                  |
   |                                  +--> Inventory                      |
   |                                  +--> Supplier Bill / AP             |
   |                                  +--> Accounting                     |
```

## 6. Marketplace Publication Architecture

Public visibility is explicit opt-in.

Target structure:

```text
Tenant/Company/Branch
   -> MarketplacePublication
   -> PublicBusinessProfile projection
   -> PublicServiceListing projection
```

Invariants:

- new ERP businesses/branches are not public by default;
- publication lifecycle changes are authorized and audited;
- public APIs select allowlisted fields explicitly;
- internal Customer, HR, finance, margin, private notes and permission data are never returned by public projections;
- unpublishing must remove the business from public discovery without deleting ERP records.

## 7. Availability and Marketplace Booking Architecture

Availability is a derived decision, not a permanently guaranteed slot until booking commits.

Candidate availability may consume:

- branch operating hours,
- service duration,
- staff eligibility,
- staff working schedule,
- leave/breaks,
- existing appointment occupancy,
- required room/resource/equipment,
- buffers and capacity policies.

Target booking flow:

```text
Availability Query
  -> Candidate Slot
  -> Booking Request + Idempotency Key
  -> Revalidate inside transaction/lock boundary
  -> Reserve/Create Appointment exactly once
  -> MarketplaceBooking confirmation
```

Double-booking prevention must use database/transaction-level guarantees. Cached/search availability is advisory until commit succeeds.

## 8. Supplier Identity Model

Initial `SupplierOrganization` fields:
- id
- slug
- legalName
- displayName
- organizationType
- status
- verificationStatus
- website
- email
- phone
- taxCountry
- taxNumber
- createdAt
- updatedAt

Organization type initially supports:
- MANUFACTURER
- DISTRIBUTOR
- IMPORTER
- WHOLESALER
- RETAILER
- SERVICE_PROVIDER
- OTHER

Verification lifecycle:
- UNVERIFIED
- PENDING
- VERIFIED
- REJECTED
- SUSPENDED

Lifecycle status:
- ACTIVE
- INACTIVE
- SUSPENDED
- ARCHIVED

## 9. Supplier Connection

`SupplierConnection` links a platform supplier to an existing company-private `inventory_suppliers` record.

Required invariants:
- Connection contains tenantId and companyId.
- The referenced private vendor card must belong to the same tenant/company.
- A private vendor card can connect to at most one SupplierOrganization.
- A SupplierOrganization can be connected by many independent buyer companies.
- Connecting a supplier never grants supplier users access to buyer financial, inventory or CRM data.
- Scope validation should exist at both service/application layer and database integrity layer where feasible.

## 10. Supplier Membership and Verification (planned)

Supplier Portal access should be modeled independently from ERP tenant membership.

Target concepts:

```text
SupplierOrganization
  -> SupplierMembership
  -> SupplierRole / Permission
  -> SupplierLocation
  -> SupplierVerificationCase
  -> SupplierDocument / ComplianceDocument
```

Verification state transitions must be auditable. Public selling/listing permissions may depend on organization status, verification status and category-specific compliance status.

Self-service supplier onboarding must not be opened before this boundary is implemented.

## 11. Catalog Architecture (planned)

Do not duplicate canonical products per seller.

```text
CatalogProduct
    +--> ProductIdentifier (GTIN / manufacturer code / UTS where applicable)
    +--> ProductVariant
    +--> SupplierOffer A
    +--> SupplierOffer B
    +--> SupplierOffer C
```

A supplier offer owns seller-specific commercial facts such as price, minimum order quantity, lead time and availability. The canonical product owns shared identity/specification facts.

Possible future matching/deduplication signals:

- GTIN,
- manufacturer part number,
- manufacturer + model,
- regulatory identifier,
- controlled manual merge/review.

Never auto-merge ambiguous regulated/device products solely on fuzzy text similarity.

## 12. SupplierOffer Architecture (planned)

A SupplierOffer represents one supplier's commercial offer for a canonical product/variant or approved service capability.

Expected attributes may include:

- supplierOrganizationId,
- catalogProduct/variant reference,
- seller SKU,
- price and currency,
- VAT/tax treatment metadata where appropriate,
- minimum order quantity,
- order multiple,
- lead time,
- stock/availability signal,
- validFrom/validUntil,
- territory,
- private/contract visibility,
- buyer eligibility constraints.

Offer data must be snapshotted into the buyer transaction where required so later supplier price changes do not rewrite historical purchase facts.

## 13. RFQ Architecture (planned)

RFQ is a first-class procurement workflow, especially for equipment, medical devices, furniture, technical services and high-value purchases.

```text
PurchaseRequest
   -> RFQ
   -> invited/eligible SupplierOrganizations
   -> SupplierQuote(s)
   -> QuoteComparison
   -> Award
   -> PurchaseOrder
```

Quote comparison should support price, currency, delivery time, warranty, installation, training, payment terms, financing and service SLA.

Confidentiality invariants:

- one supplier cannot read a competing supplier's private quote;
- a buyer can only read RFQs/quotes inside its authorized tenant/company scope;
- an RFQ may be invite-only or policy-discoverable;
- quote revisions remain auditable.

## 14. Procurement Integration Rule

Supplier Network does not own buyer accounting or inventory posting.

On award/checkout, the system should resolve the supplier identity into the buyer's private vendor relationship and continue through existing Procurement.

```text
SupplierOffer / SupplierQuote
  -> SupplierConnection / buyer vendor resolution
  -> PurchaseOrder snapshot
  -> GoodsReceipt
  -> Inventory
  -> SupplierBill / AP
  -> Accounting
```

Purchase orders must retain the commercial facts required for audit even if a catalog or offer later changes.

## 15. Smart Procurement (planned)

ERP operational data may create recommendations, not uncontrolled state changes.

```text
Inventory consumption
  -> reorder/demand calculation
  -> recommendation
  -> eligible offer/contract/RFQ options
  -> approval
  -> PurchaseOrder
```

Inputs may include:

- historical usage,
- current stock,
- reserved stock,
- reorder point,
- supplier lead time,
- minimum order quantity,
- budget,
- contract price,
- branch demand,
- safety stock.

Automatic ordering remains a later capability and must respect approvals, budgets, idempotency and exception policies.

## 16. Equipment / Asset Lifecycle (planned)

High-value equipment must not end at purchase.

```text
PurchaseOrder
  -> GoodsReceipt
  -> Asset / Equipment
  -> Serial Number
  -> Installation
  -> Warranty
  -> Maintenance Plan
  -> Usage / Service History
  -> Spare Parts / Consumables
  -> Replacement / Disposal
```

This enables device maintenance, warranty, technical service and replenishment flows to remain connected to Procurement.

Supplier Network may later publish authorized service capabilities and compatible consumables/spare parts.

## 17. Compliance Boundary

Regulated product categories require policy-driven access. Supplier Network must be designed to support future verification rules such as organization credentials, facility eligibility, professional eligibility, product identifiers, lot/serial traceability and category restrictions.

Potential structured compliance data includes:

- product/device class,
- UTS/equivalent identifier where applicable,
- GTIN,
- lot/batch,
- serial number,
- expiry date,
- seller authorization,
- buyer/facility eligibility,
- recall/field-safety status.

Do not expose or sell a regulated product solely because a SupplierOffer exists. Eligibility must be evaluated at transaction time.

## 18. Privacy and Data Isolation

- Marketplace only exposes explicit allowlisted public fields.
- Supplier Network public profiles expose only explicitly published supplier fields.
- Buyer procurement history is private to the tenant/company.
- Supplier analytics may use only appropriately authorized and privacy-safe aggregated data.
- No supplier receives another supplier's private offer terms or a buyer's unrelated commercial data.
- Supplier Network platform identity must not be used as a shortcut around tenant scoping.

## 19. Event Boundaries (planned)

Useful domain events:
- marketplace.business.published
- marketplace.business.unpublished
- marketplace.booking.created
- marketplace.booking.cancelled
- supplier.organization.created
- supplier.organization.verified
- supplier.connection.created
- catalog.offer.published
- procurement.rfq.created
- procurement.quote.submitted
- procurement.quote.awarded
- procurement.purchase_order.ordered
- procurement.goods_receipt.posted
- procurement.purchase_return.posted
- equipment.maintenance.due

Events are integration facts; they do not bypass authorization or accounting invariants.

## 20. Commercial Extensions (planned)

Potential ecosystem products:
- Supplier Portal
- RFQ / reverse marketplace
- contract pricing / private catalogs
- automated replenishment
- group purchasing
- logistics / fulfillment integrations
- equipment leasing / financing integrations
- maintenance/service marketplace
- education/certification marketplace
- supplier intelligence using privacy-safe aggregate metrics
- EDI/API supplier integrations
- recall and lot/serial traceability

These are product extensions, not prerequisites for the current technical foundation.

## 21. Current Implemented Foundation

At the time this architecture baseline was updated:

Marketplace foundation includes:

- separate NestJS Marketplace module,
- authenticated marketplace preview foundation,
- safe/allowlisted business and service projection approach,
- Marketplace module registration in the API application.

Supplier Network foundation includes:

- `supplier_organizations`,
- `supplier_connections`,
- database-level connection scope guard,
- Supplier Network module/service foundation,
- API application registration.

Existing Procurement already contains buyer-side purchase request/order/receipt/return and AP/accounting integration foundations. Supplier Network must connect to those flows rather than recreate them.

For exact current status and remaining work, use `roadmap/VALOO-IMPLEMENTATION-STATUS.md` rather than this architecture document.

## 22. Delivery Order

Canonical delivery order is maintained in `roadmap/VALOO-MARKETPLACE-SUPPLIER-ROADMAP.md`.

High-level sequence:

1. Marketplace publication foundation.
2. SupplierOrganization core and connection integrity.
3. Supplier verification and Supplier Portal identity.
4. Marketplace availability and booking reliability.
5. Canonical catalog and SupplierOffer.
6. RFQ and SupplierQuote.
7. PurchaseOrder integration with SupplierOffer/Quote.
8. consumer experience/payment expansion.
9. automated replenishment and contract pricing.
10. equipment/asset lifecycle and technical service.
11. compliance, logistics, financing and intelligence extensions.

## 23. Non-goals for Early Increments

Early foundation work intentionally does **not** imply immediate support for:
- unrestricted public supplier self-registration,
- public supplier write endpoints without verification,
- full payment settlement marketplace,
- regulated product open sales,
- supplier access to tenant data,
- AI-driven autonomous purchasing,
- national marketplace growth operations.

The objective is to establish stable trust, identity, publication and transaction boundaries first.
