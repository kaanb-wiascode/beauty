# VALOO — Marketplace + Supplier Network Delivery Roadmap

> Status: Canonical delivery sequence
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

Target entities:

- Brand.
- CatalogProduct.
- ProductVariant.
- ProductIdentifier.
- SupplierOffer.
- offer validity.
- MOQ.
- lead time.
- currency.
- availability.
- territory/eligibility metadata.

Rules:

- canonical product identity is seller-independent.
- seller price/availability lives in SupplierOffer.
- duplicate product prevention/matching strategy is required.
- regulated identifiers remain structured fields, not free-text only.

Acceptance criteria:

- multiple suppliers can offer the same canonical item.
- buyer can compare offers without duplicated product identity.
- private/contract offers can be hidden from unauthorized buyers.

## 9. Milestone M7 — RFQ + SupplierQuote

Goal: support negotiated/high-value B2B procurement.

Target flow:

```text
PurchaseRequest -> RFQ -> Suppliers -> Quotes -> Comparison -> Award
```

Target comparison fields:

- price/currency,
- delivery,
- warranty,
- installation,
- training,
- payment terms,
- financing option,
- service SLA,
- quote validity.

Acceptance criteria:

- RFQ can be scoped to invited or eligible suppliers.
- supplier sees only RFQs it is authorized to access.
- competing supplier private quotes are isolated.
- buyer can award one or more lines according to approved policy.

## 10. Milestone M8 — Procurement Integration

Goal: turn a selected Marketplace/Supplier transaction into existing buyer-side procurement records.

Required work:

- SupplierOffer/Quote -> private vendor card mapping.
- create/connect `inventory_suppliers` safely when policy allows.
- PurchaseOrder stores snapshot facts needed for audit.
- GoodsReceipt continues to post inventory.
- SupplierBill/AP continues to post financial obligation.
- accounting integrity remains unchanged.

Acceptance criteria:

```text
SupplierQuote/Offer
 -> PurchaseOrder
 -> GoodsReceipt
 -> Inventory
 -> AP
 -> Accounting
```

is traceable end to end.

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
