# Frontend Navigation Reconciliation Checkpoint

Last updated: 2026-09-13

## Scope

This checkpoint records the frontend/navigation reconciliation completed on `feature/core-commerce-foundation` after the backend freeze. The goal is to keep implemented tenant-facing domains reachable without weakening authorization boundaries or exposing platform-only surfaces.

## Verified tenant-facing navigation

The following top-level tenant areas are reachable from the main shell or from their owning domain navigation:

- Dashboard
- CRM / Customers
- Appointments / Services / Staff / Payments
- Finance / Treasury / Integrations / Reconciliation
- HR
- Training
- Inventory / Procurement
- Reports
- Quality Management
- Marketplace publication management

### Marketplace

`/marketplace` is a tenant-facing operational surface, not a platform-admin surface.

Backend contract:

- preview/publication status: `services.read`
- publish/unpublish: `services.update`

Frontend reconciliation:

- Services now links to Marketplace publication management.
- Marketplace links back to Services.
- The two screens share the same domain context without adding unsafe global navigation visibility.

### Quality / Analytics

Quality cockpit and comparison routes are implemented tenant features.

Frontend reconciliation:

- `/quality` has direct section navigation.
- Reports expose Quality only when `quality.read` is present.
- Quality exposes Reports only when `reports.read` is present.
- Quality/Training comparison remains visible only when both `quality.read` and `training.read` are present.
- Active route state uses `aria-current`.

### Procurement

The procurement UI already covers the governed lifecycle:

`Purchase Request -> Approval -> Purchase Order -> Approval Workflow -> Order -> Goods Receipt`

Procurement sub-navigation now exposes active route state for requests/orders, RFQs, commercial origins, goods receipts/returns and replacements.

## Platform-only surfaces

Do not add `/platform/*` routes to the normal tenant sidebar.

Platform supplier-network administration is guarded by `PlatformAdminGuard`, which checks `platform_admin_users` at runtime. Current web session storage contains tenant membership permissions but no trustworthy platform-admin capability flag.

A future platform-admin navigation entry requires an explicit authenticated capability contract rather than role-name guessing or client-only inference.

## Recent reconciliation commits

- `39234ddd` - `feat(web): add quality section navigation`
- `8474323b` - `feat(web): highlight procurement navigation state`
- `853b999b` - `feat(web): expose marketplace from services`
- `314d3189` - `feat(web): add marketplace section navigation`
- `7e2d91f4` - `fix(web): mark services navigation current`
- `f8eeb4bc` - `feat(web): add permission-aware analytics navigation`
- `ac4a8763` - `feat(web): connect analytics section navigation`
- `4e9e6d26` - `feat(web): reconcile quality analytics navigation`

## Next frontend priorities

1. Continue operational UX reconciliation without recreating frozen backend foundations.
2. Audit responsive/mobile navigation against the same permission rules.
3. Audit empty/error/loading states across CRM, Quality, Marketplace and Procurement.
4. Continue CRM future increment work separately: Opportunity -> Sale linkage remains intentionally unimplemented.
5. Keep platform-admin navigation isolated until an explicit platform capability endpoint/session contract exists.
