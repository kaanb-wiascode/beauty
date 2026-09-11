# VALOO — Marketplace + Supplier Network + Procurement Architecture

> Status: Architectural baseline
> Scope: VALOO Marketplace, Supplier Network, buyer-side Procurement and their integration with the existing ERP domains.

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

## 4. High-Level Flow

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

## 5. Supplier Identity Model

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

## 6. Supplier Connection

`SupplierConnection` links a platform supplier to an existing company-private `inventory_suppliers` record.

Required invariants:
- Connection contains tenantId and companyId.
- The referenced private vendor card must belong to the same tenant/company.
- A private vendor card can connect to at most one SupplierOrganization.
- A SupplierOrganization can be connected by many independent buyer companies.
- Connecting a supplier never grants supplier users access to buyer financial, inventory or CRM data.

## 7. Catalog Architecture (planned)

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

## 8. RFQ Architecture (planned)

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

Quote comparison should support price, currency, delivery time, warranty, installation, training, payment terms and service SLA.

## 9. Equipment / Asset Lifecycle (planned)

High-value equipment must not end at purchase.

```text
PurchaseOrder
  -> GoodsReceipt
  -> Asset / Equipment
  -> Serial Number
  -> Warranty
  -> Maintenance Plan
  -> Service History
  -> Spare Parts / Consumables
  -> Disposal / Replacement
```

This enables device maintenance, warranty, technical service and replenishment flows to remain connected to Procurement.

## 10. Compliance Boundary

Regulated product categories require policy-driven access. Supplier Network must be designed to support future verification rules such as organization credentials, facility eligibility, professional eligibility, product identifiers, lot/serial traceability and category restrictions.

Do not expose or sell a regulated product solely because a SupplierOffer exists. Eligibility must be evaluated at transaction time.

## 11. Privacy and Data Isolation

- Marketplace only exposes explicit allowlisted public fields.
- Supplier Network public profiles expose only explicitly published supplier fields.
- Buyer procurement history is private to the tenant/company.
- Supplier analytics may use only appropriately authorized and privacy-safe aggregated data.
- No supplier receives another supplier's private offer terms or a buyer's unrelated commercial data.

## 12. Event Boundaries (planned)

Useful domain events:
- marketplace.business.published
- marketplace.booking.created
- supplier.organization.verified
- supplier.connection.created
- catalog.offer.published
- procurement.rfq.created
- procurement.quote.submitted
- procurement.purchase_order.ordered
- procurement.goods_receipt.posted
- procurement.purchase_return.posted

Events are integration facts; they do not bypass authorization or accounting invariants.

## 13. Commercial Extensions (planned)

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

## 14. Delivery Order

1. Marketplace publication foundation.
2. SupplierOrganization core.
3. SupplierConnection to existing private vendor cards.
4. Supplier verification and Supplier Portal identity.
5. Canonical catalog and SupplierOffer.
6. RFQ and SupplierQuote.
7. PurchaseOrder integration with SupplierOffer/Quote.
8. Automated replenishment and contract pricing.
9. Equipment/asset lifecycle and technical service.
10. Compliance, logistics, financing and intelligence extensions.

## 15. Non-goals for the Initial SupplierOrganization Increment

The first increment intentionally does **not** add:
- public supplier self-registration,
- public write endpoints,
- payments,
- product catalog,
- RFQ,
- regulated product sales,
- supplier access to tenant data.

It establishes a stable platform identity boundary that later features can safely reference.
