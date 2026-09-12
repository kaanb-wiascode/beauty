# VALOO — Marketplace + Supplier Network Delivery Roadmap

> Status: Canonical delivery sequence
> Current implementation checkpoint: M6, M7 and M8 feature foundations are implemented on `feature/core-commerce-foundation`; advanced commercial-policy extensions remain explicitly future work.
> Depends on: `../VALOO-ECOSYSTEM-MASTER-PLAN.md`, `../MARKETPLACE-SUPPLIER-PROCUREMENT-ARCHITECTURE.md`

## 1. Working Principle

This roadmap is the execution order for Marketplace, Supplier Network and their Procurement integration. It is not a promise of calendar dates. Work proceeds incrementally and every milestone must be validated against the existing codebase before implementation.

Do not merge or push to `main` without explicit approval. Current development branch is `feature/core-commerce-foundation`.

## 2. Milestone M0 — Documentation and Domain Boundaries

Goal: make product/domain decisions explicit before deeper implementation.

Acceptance criteria:

- [x] Marketplace bounded context documented.
- [x] Supplier Network bounded context documented.
- [x] Procurement boundary documented.
- [x] `SupplierOrganization` separated from tenant-private `inventory_suppliers`.
- [x] `SupplierConnection` boundary defined.
- [x] Canonical catalog principle documented.
- [x] RFQ principle documented.
- [x] Equipment/asset lifecycle direction documented.
- [x] Compliance boundary documented.
- [x] Master Plan and roadmap created.

## 3. Milestone M1 — Marketplace Publication Foundation

Goal: allow an ERP business/branch to prepare marketplace-safe public data without exposing private tenant data.

Required work:

- Marketplace module boundary.
- authenticated preview endpoint.
- explicit publication entity/state.
- default unpublished state.
- branch/business public slug strategy.
- allowlisted public business projection.
- allowlisted public service projection.
- publish/unpublish audit trail.
- RBAC for publication management.
- tests proving private customer/staff/finance fields are not returned.

Acceptance criteria:

- [x] Marketplace module exists.
- [x] Authenticated preview foundation exists.
- [ ] Explicit `MarketplacePublication` persistence exists.
- [ ] Publish/unpublish workflow exists.
- [ ] Public read API exists.
- [ ] Publication authorization tests pass.
- [ ] Data-leakage tests pass.

## 4. Milestone M2 — SupplierOrganization Foundation

Goal: create a platform-wide supplier identity without replacing tenant-private vendor cards.

Required work:

- platform supplier organization table.
- organization type and lifecycle status.
- verification status.
- connection table to `inventory_suppliers`.
- tenant/company scope guard.
- service/domain layer.
- admin-only creation/lookup initially.
- audit hooks.

Acceptance criteria:

- [x] `supplier_organizations` foundation exists.
- [x] `supplier_connections` foundation exists.
- [x] database scope guard exists.
- [x] Supplier Network module/service foundation exists.
- [ ] API/admin workflow implemented with RBAC.
- [ ] audit trail implemented.
- [ ] integration tests cover cross-tenant rejection.

## 5. Milestone M3 — Supplier Identity, Membership and Verification

Goal: safely onboard supplier-side users before self-service commerce is opened.

Target entities/capabilities:

- SupplierLocation.
- SupplierMembership.
- supplier roles/permissions.
- SupplierVerificationCase.
- SupplierDocument / ComplianceDocument.
- verification review workflow.
- suspension/revocation workflow.
- supplier ownership/admin invitation flow.
- audit events.

Acceptance criteria:

- supplier user cannot access buyer tenant data merely due to a connection.
- all membership actions are scoped to a SupplierOrganization.
- verification state transitions are auditable.
- public selling/publishing requires policy-approved status.

## 6. Milestone M4 — Marketplace Availability Engine

Goal: return reliable bookable slots from ERP state.

Initial inputs:

- branch hours,
- service duration,
- eligible staff,
- existing appointments,
- staff schedule/availability,
- simple buffers.

Later inputs:

- rooms,
- equipment/resources,
- breaks/leave,
- capacity pools,
- service preparation/cleanup buffers.

Technical requirements:

- timezone-safe calculations.
- deterministic slot generation.
- no stale slot is treated as guaranteed until booking commit.
- database-backed double-booking protection.
- performance suitable for search/profile traffic.

Acceptance criteria:

- API returns only actually eligible candidate slots.
- concurrent attempts for the same scarce slot cannot both commit.
- tests cover overlapping appointments and boundary times.

## 7. Milestone M5 — Marketplace Booking Orchestration

Goal: convert a consumer marketplace booking into a trusted ERP appointment.

Required work:

- MarketplaceBooking orchestration record or equivalent idempotency boundary.
- consumer identity/contact capture policy.
- booking idempotency key.
- transaction boundary.
- appointment creation.
- confirmation state.
- cancellation/reschedule rules foundation.
- event emission.

Acceptance criteria:

```text
Marketplace selection -> booking commit -> ERP appointment
```

occurs exactly once for a given idempotent request.

## 8. Milestone M6 — Canonical Catalog + SupplierOffer

Goal: establish the B2B marketplace product model.

Implementation status: **foundation implemented**.

Implemented:

- [x] platform-wide Brand model.
- [x] canonical CatalogProduct model.
- [x] canonical ProductVariant model.
- [x] structured ProductIdentifier foundation.
- [x] seller-owned SupplierOffer model separated from canonical product identity.
- [x] offer validity window.
- [x] MOQ and order-multiple fields.
- [x] lead/preparation/shipping timing fields.
- [x] currency, unit price and available quantity.
- [x] optimistic offer versioning, row locking and append-only offer events.
- [x] VERIFIED SupplierOrganization required before an offer can become ACTIVE.
- [x] Supplier Portal catalog/offer management UI.
- [x] buyer offer-comparison UI across connected verified suppliers.
- [x] tenant-private inventory product -> global catalog variant mapping with DB scope guard.
- [x] multiple suppliers can offer the same canonical variant without duplicating product identity.

Still future policy work:

- [ ] private/contract-offer buyer eligibility policy engine.
- [ ] territory/region eligibility metadata and enforcement.
- [ ] richer duplicate-product matching/merge operations for catalog governance.
- [ ] category-specific regulatory identifier policy beyond the structured identifier foundation.

Rules retained:

- canonical product identity is seller-independent.
- seller price/availability lives in SupplierOffer.
- tenant inventory products remain private and map explicitly to canonical variants.
- ACTIVE offer discovery is limited to connected, ACTIVE and VERIFIED supplier organizations.

## 9. Milestone M7 — RFQ + SupplierQuote

Goal: support negotiated/high-value B2B procurement.

Implementation status: **foundation implemented**.

Implemented flow:

```text
Canonical-linked inventory need
 -> RFQ
 -> connected invited suppliers
 -> SupplierQuote
 -> buyer comparison
 -> award
 -> DRAFT PurchaseOrder
```

Implemented:

- [x] RFQ tenant/company/branch scoping.
- [x] branch-safe warehouse and canonical-linked product options.
- [x] invited supplier set restricted to ACTIVE SupplierConnection + ACTIVE/VERIFIED SupplierOrganization.
- [x] supplier-side RFQ organization isolation.
- [x] SupplierQuote DRAFT / SUBMITTED / WITHDRAWN / ACCEPTED / REJECTED lifecycle.
- [x] quote optimistic version checks, row locks and SERIALIZABLE transaction boundaries.
- [x] append-only RFQ and quote events.
- [x] Supplier Portal RFQ inbox and quote workspace.
- [x] OWNER/ADMIN quote mutation and MEMBER read-only role boundary.
- [x] buyer RFQ cockpit with publish/close/cancel, quote comparison and award.
- [x] winning quote creates only a DRAFT PurchaseOrder; existing procurement approval is never bypassed.
- [x] repeated award of the same winning quote resolves to the existing conversion instead of duplicating the order.
- [x] competing submitted quotes are rejected when a winner is awarded.

Current comparison fields:

- price/currency,
- available quantity,
- lead time,
- quote validity,
- supplier identity.

Still future commercial expansion:

- [ ] warranty.
- [ ] installation.
- [ ] training.
- [ ] payment terms.
- [ ] financing option.
- [ ] service SLA.
- [ ] line-split / multi-winner award policy.

## 10. Milestone M8 — Procurement Integration

Goal: turn a selected Supplier transaction into existing buyer-side procurement records without creating a parallel purchasing/accounting model.

Implementation status: **end-to-end foundation implemented**.

Implemented:

- [x] SupplierConnection maps global SupplierOrganization to the tenant-private `inventory_suppliers` vendor card.
- [x] ACTIVE SupplierOffer can create an idempotent DRAFT PurchaseOrder.
- [x] awarded SupplierQuote/RFQ creates a DRAFT PurchaseOrder.
- [x] SupplierOffer conversion revalidates ACTIVE/VERIFIED organization, ACTIVE connection, current offer version and validity.
- [x] SupplierOffer conversion enforces MOQ, order multiple and available quantity.
- [x] SupplierOffer conversion requires the buyer inventory product to map to the same canonical variant.
- [x] branch warehouse scope is enforced before DRAFT PO creation.
- [x] existing PO approval workflow remains mandatory; supplier-marketplace selection never produces APPROVED/ORDERED directly.
- [x] `procurement_purchase_order_origins` stores immutable source facts for SupplierOffer and SupplierQuote origins.
- [x] origin DB guard verifies PO tenant/company, SupplierConnection/private vendor and source SupplierOrganization consistency.
- [x] SupplierQuote/RFQ awards are bridged into the same origin model through a DB trigger.
- [x] source version and high-precision commercial source values remain preserved in JSONB snapshot even where PO accounting unit cost is normalized to two decimals.
- [x] buyer-side commercial-origin audit endpoint and cockpit expose SupplierOffer / RFQ provenance without mutating the snapshot.
- [x] GoodsReceipt, inventory, supplier bill/AP and accounting continue through the existing procurement/accounting chain.

Verified chain:

```text
SupplierOffer or SupplierQuote
 -> tenant-private vendor via SupplierConnection
 -> DRAFT PurchaseOrder
 -> Procurement approval
 -> ORDERED
 -> GoodsReceipt
 -> Inventory
 -> SupplierBill / AP
 -> Accounting
```

Remaining policy extensions do not block this foundation:

- [ ] automatic creation of a tenant-private vendor card when no approved SupplierConnection exists; current behavior intentionally requires an existing safe mapping.
- [ ] contract pricing / landed-cost policy layers.
- [ ] automatic ordering; explicitly out of scope until policy controls and exception handling are production-grade.

## 11. Milestone M9 — Consumer Experience Expansion

After booking reliability:

- ConsumerAccount.
- reservation history.
- favorites.
- verified reviews.
- cancellation/reschedule self-service.
- waitlist.
- notification preferences.
- online payment/deposit.
- no-show protection.
- promotions/coupons.
- loyalty.

Reviews should be tied to eligible/verified transaction history where possible to reduce abuse.

## 12. Milestone M10 — Smart Procurement

Goal: use ERP inventory and consumption data to recommend purchasing actions.

Capabilities:

- reorder policies.
- demand forecast.
- recommended quantities.
- preferred supplier rules.
- contract pricing.
- landed-cost comparison.
- budget/approval integration.
- group purchasing foundation.
- AI-assisted recommendation later.

Automatic ordering is out of scope until policy controls and exception handling are production-grade.

## 13. Milestone M11 — Equipment / Asset + Service Network

Goal: extend high-value procurement beyond the purchase event.

Capabilities:

- equipment/asset registry.
- serial numbers.
- branch assignment.
- installation.
- warranty.
- preventive maintenance.
- service ticket/history.
- consumable/spare-part relationships.
- authorized service-provider network.
- calibration where applicable.
- replacement/disposal.

## 14. Milestone M12 — Compliance, Logistics and Financing

Capabilities:

- category-specific buyer/seller eligibility.
- regulated catalog controls.
- lot/batch/serial/expiry traceability.
- recall workflows.
- shipment/fulfillment integrations.
- supplier API/EDI feeds.
- leasing/financing offers.
- payment/settlement extensions where legally and technically appropriate.

## 15. Milestone M13 — Intelligence and AI

Only after sufficient quality data exists:

- supplier intelligence using privacy-safe aggregates.
- category-demand insights.
- replenishment recommendations.
- quote comparison assistance.
- supplier risk/lead-time quality scoring.
- consumer recommendations.
- Marketplace AI concierge.

AI recommendations never bypass compliance, authorization, approval or financial controls.

## 16. Definition of Done for Every Milestone

A milestone is not complete only because UI works. Relevant items must be satisfied:

- domain model reviewed against existing code,
- migration is backward-safe,
- tenant/company/branch isolation verified,
- authorization/RBAC implemented,
- validation implemented,
- idempotency/concurrency handled where applicable,
- auditability preserved,
- unit/integration tests added,
- happy path and reversal/error path considered,
- docs updated,
- CI/checks reviewed where available,
- no secrets or credentials exposed.

## 17. Change Control

When a new idea arrives:

1. classify it as Marketplace, Supplier Network, Procurement, shared platform or future extension;
2. check whether an existing domain already owns the responsibility;
3. update the Master Plan when product scope changes;
4. update Architecture when ownership/entity/invariant changes;
5. place work into the correct roadmap milestone;
6. implement incrementally;
7. update Implementation Status with commit/evidence.

Do not create a new table/module merely because a new feature name exists. Extend an existing bounded context when responsibility already belongs there.
