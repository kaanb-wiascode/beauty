# VALOO Documentation Index

This directory is the canonical documentation surface for VALOO. Product, architecture and delivery decisions should be reflected here before or together with code changes that materially affect those decisions.

## 1. Core Product / Architecture Documents

| Document | Authority |
|---|---|
| `00-PROJECT-CONTEXT.md` | Legacy/current overall ERP project context. Some naming is still historical; new ecosystem decisions defer to the VALOO master plan below. |
| `VALOO-ECOSYSTEM-MASTER-PLAN.md` | Canonical product scope and strategic decisions for VALOO Business, Marketplace, Supplier Network and Procurement ecosystem. |
| `MARKETPLACE-SUPPLIER-PROCUREMENT-ARCHITECTURE.md` | Canonical bounded-context, domain ownership, data-isolation and integration architecture for Marketplace/Supplier/Procurement. |
| `03-DOMAIN-MODEL.md` | Core ERP domain model and organization concepts. |
| `04-DATABASE-DESIGN.md` | General database design baseline. |
| `05-API-CONTRACTS.md` | General API contracts. |
| `06-AUTHORIZATION.md` / `12-AUTHORIZATION-MODEL.md` | Authorization principles and model. |
| `08-SECURITY.md` | Security baseline. |
| `10-DATABASE-CONVENTIONS.md` | Database conventions. |
| `11-API-CONVENTIONS.md` | API conventions. |

## 2. Roadmap / Execution Documents

| Document | Purpose |
|---|---|
| `roadmap/VALOO-MARKETPLACE-SUPPLIER-ROADMAP.md` | Canonical delivery order, milestones, acceptance criteria and definition of done. |
| `roadmap/VALOO-IMPLEMENTATION-STATUS.md` | Evidence-based record of what is actually implemented and what remains. |

## 3. Decision Precedence

When documents conflict for Marketplace, Supplier Network or Procurement ecosystem work, use this precedence:

1. security/data-isolation invariants and existing canonical technical conventions,
2. `VALOO-ECOSYSTEM-MASTER-PLAN.md` for product scope,
3. `MARKETPLACE-SUPPLIER-PROCUREMENT-ARCHITECTURE.md` for domain ownership/invariants,
4. roadmap for implementation sequence,
5. implementation status for current factual state,
6. older/legacy project text for background context.

Legacy references to “Beauty ERP” do not override the current product name **VALOO**.

## 4. Required Workflow for Future Development

For every Marketplace/Supplier/Procurement increment:

```text
1. Read Master Plan
2. Read relevant Architecture section
3. Read current Roadmap milestone
4. Inspect current code/migrations before creating anything
5. Implement only on the active feature branch
6. Add/adjust tests
7. Check exact-commit CI/status if available
8. Update Implementation Status
9. Update Master Plan / Architecture / Roadmap if the decision changed
```

Do not create duplicate tables, modules, services, endpoints or migrations when the responsibility already exists.

## 5. Branch Policy

Current development branch:

`feature/core-commerce-foundation`

Do not merge or push to `main` without explicit approval.

## 6. Non-Negotiable Engineering Rules

- preserve tenant/company/branch isolation,
- preserve RBAC and explicit authorization,
- public APIs expose allowlisted projections only,
- financial operations prioritize idempotency, auditability, concurrency and accounting integrity,
- external callbacks/webhooks must be signed/idempotent where relevant,
- secrets/API credentials are never returned and are not stored in plaintext,
- never collect internet-banking usernames/passwords,
- regulated product flows require explicit compliance policy,
- supplier identities do not gain buyer-tenant access merely because a commercial relationship exists,
- consumer identity, supplier identity and ERP business-user identity remain separate authorization domains unless explicitly linked by controlled workflows.

## 7. Documentation Change Rule

A material code change is incomplete from a project-governance perspective if it changes product scope, ownership, public/private data boundaries, lifecycle states, transaction flow or development order without updating the relevant `/docs` source of truth.
